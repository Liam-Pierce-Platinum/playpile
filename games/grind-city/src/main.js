import { createView } from './render/view.js';
import { P, THEMES } from './art/palette.js';
import {
  drawSky, drawParallax, drawTerrain, drawRails, drawDecor, drawCoins, matRamp,
} from './art/scenery.js';
import { drawBoard } from './art/board3d.js';
import { drawSkater } from './art/skater.js';
import { PARKS, getPark } from './world/parks.js';
import { WORLD } from './world/park.js';
import { createBoard } from './game/board.js';
import { createSkater } from './game/skater.js';
import { createScore } from './game/tricks.js';
import { loadSave, writeSave, earn, look, resetSave, legs, GEAR } from './game/wardrobe.js';
import { drawHud } from './ui/hud.js';
import { text } from './ui/font.js';
import { buildShop, refreshShop, drawRiderPreview, riderFacing } from './ui/shop.js';
import { COMPS, compById, createComp } from './game/comp.js';
import { poseForKey } from './game/poses.js';
import { drawTargets, drawCompHud } from './ui/comphud.js';
import { buildSheets, startSheets, stopSheets, setSheetLook } from './ui/tricksheet.js';
import { installTouch, isTouch } from './ui/touch.js';
import * as portal from './crazygames.js';

const canvas = document.getElementById('screen');
const v = createView(canvas);

const els = {
  title: document.getElementById('title'),
  shop: document.getElementById('shop'),
  pause: document.getElementById('pause'),
  lock: document.getElementById('lock'),
  parks: document.getElementById('parks'),
  sens: document.getElementById('sens'),
  sensval: document.getElementById('sensval'),
  invert: document.getElementById('invert'),
  settings: document.getElementById('settings'),
  padstr: document.getElementById('padstr'),
  padstrval: document.getElementById('padstrval'),
  scanlines: document.getElementById('scanlines'),
  camlead: document.getElementById('camlead'),
  camleadval: document.getElementById('camleadval'),
  settingsNote: document.getElementById('settings-note'),
  cash: document.querySelectorAll('.cashval'),
  homePreview: document.getElementById('home-preview'),
  comps: document.getElementById('comps'),
  compList: document.getElementById('comp-list'),
  tricks: document.getElementById('tricks'),
  sheetList: document.getElementById('sheet-list'),
  results: document.getElementById('results'),
  resultBody: document.getElementById('result-body'),
};

const save = loadSave();
let myLook = look(save);

let mode = 'title';       // title | shop | play | pause
let park = null, board = null, sk = null, score = null;
let mdx = 0, mdy = 0;     // raw pointer-lock movement collected this frame
let held = { left: false, right: false };
let arrows = { up: false, down: false, left: false, right: false };
let clock = 0;
let endless = false;
let comp = null;
let runMetres = 0;
let wrapLen = 0;
// how far into each end flat the wrap happens. A length, so it grows with
// the park -- the opening flat is 1.75x longer than it was too.
const SEAM = 120 * WORLD;
const cam = { x: 0, y: 0 };
const DECK = 1.0;   // 19px of deck under a 31px rider

// --- the arrow keys, as a mirror of the mouse -------------------------------
// A key press fires a fixed IMPULSE of cursor travel, not a continuous push --
// that is what makes it a flick rather than a shove, and it is why holding a
// key does not spin the deck forever. The direction is re-read every frame
// while the impulse runs, so pressing UP then RIGHT a moment later still comes
// out as one up-right diagonal.
const PAD_IMPULSE = 0.10;   // seconds
const PAD_TRAVEL = 2.2;     // pad units covered in that time
const PAD_SUSTAIN = 3.4;    // units/sec while a key stays held -- under flickLo
let padT = 0, padX = 0, padY = 0;

function padDelta(dt) {
  const dx = (arrows.right ? 1 : 0) - (arrows.left ? 1 : 0);
  const dy = (arrows.down ? 1 : 0) - (arrows.up ? 1 : 0);
  if (dx !== padX || dy !== padY) {
    padX = dx; padY = dy;
    padT = (dx || dy) ? PAD_IMPULSE : 0;
  }
  if (!dx && !dy) return [0, 0];
  const m = Math.hypot(dx, dy) || 1;
  if (padT > 0) {
    const step = PAD_TRAVEL * padScale * Math.min(dt, padT) / PAD_IMPULSE;
    padT -= dt;
    return [dx / m * step, dy / m * step];
  }
  // held past the impulse: just enough to hold the cursor out against the
  // spring, slow enough that it never reads as a flick
  const step = PAD_SUSTAIN * dt;
  return [dx / m * step, dy / m * step];
}

// ---------------------------------------------------------------- main screen
function money(n) { return String.fromCharCode(36) + n; }

function showCash() {
  for (const el of els.cash) el.textContent = money(save.cash);
}

function buildMenu() {
  myLook = look(save);
  els.parks.innerHTML = '';
  for (const def of PARKS) {
    const card = document.createElement('div');
    card.className = 'park';
    const c = document.createElement('canvas');
    c.width = 168; c.height = 84;
    card.appendChild(c);
    const b = document.createElement('b'); b.textContent = def.name; card.appendChild(b);
    const s = document.createElement('small'); s.textContent = def.blurb; card.appendChild(s);
    const e = document.createElement('em');
    if (def.endless) { card.classList.add('endless'); e.textContent = 'FURTHEST ' + Math.round(save.far || 0) + 'M'; }
    else e.textContent = 'BEST $' + (save.best[def.id] || 0);
    card.appendChild(e);
    thumbnail(c, getPark(def.id), def.theme);
    card.onclick = () => start(def.id);
    els.parks.appendChild(card);
  }
  showCash();
  if (els.homePreview) drawRiderPreview(els.homePreview, myLook);
}

function thumbnail(c, pk, theme) {
  const g = c.getContext('2d');
  const th = THEMES[theme];
  g.imageSmoothingEnabled = false;
  for (let i = 0; i < th.sky.length; i++) {
    g.fillStyle = th.sky[i];
    g.fillRect(0, Math.floor(i / th.sky.length * c.height), c.width, Math.ceil(c.height / th.sky.length) + 1);
  }
  const pad = 6;
  const sx = (c.width - pad * 2) / (pk.maxX - pk.minX);
  const spanY = Math.max(40, pk.maxY - pk.minY);
  const sy = (c.height * 0.62) / spanY;
  const map = (p) => [pad + (p[0] - pk.minX) * sx, c.height * 0.28 + (p[1] - pk.minY) * sy];
  g.beginPath();
  const first = map(pk.pts[0]);
  g.moveTo(first[0], c.height);
  for (const p of pk.pts) { const q = map(p); g.lineTo(q[0], q[1]); }
  const last = map(pk.pts[pk.pts.length - 1]);
  g.lineTo(last[0], c.height);
  g.closePath();
  g.fillStyle = P.con4; g.fill();
  g.strokeStyle = P.con1; g.lineWidth = 1.5; g.stroke();
  g.strokeStyle = P.met1; g.lineWidth = 1.5;
  for (const r of pk.rails) {
    const a = map([r.x0, r.y0]), b = map([r.x1, r.y1]);
    g.beginPath(); g.moveTo(a[0], a[1]); g.lineTo(b[0], b[1]); g.stroke();
  }
}

// ------------------------------------------------------------------- comps
function ordinal(n) { return n === 1 ? "1ST" : n === 2 ? "2ND" : n === 3 ? "3RD" : n + "TH"; }

function buildCompList() {
  els.compList.innerHTML = "";
  for (const def of COMPS) {
    const pk = PARKS.find((p) => p.id === def.park);
    const card = document.createElement("div");
    card.className = "comp " + def.kind;
    const k = document.createElement("span"); k.className = "kind";
    k.textContent = def.kind === "jam" ? "FREE FOR ALL"
      : def.kind === "spots" ? "TRICK PERFORM" : "LINE";
    card.appendChild(k);
    const b = document.createElement("b"); b.textContent = def.name; card.appendChild(b);
    const s = document.createElement("small");
    s.textContent = (pk ? pk.name + " - " : "") + def.blurb;
    card.appendChild(s);
    const e = document.createElement("em");
    const won = (save.podium || {})[def.id];
    e.textContent = "PURSE " + money(def.purse[0]) + (won ? "   BEST: " + ordinal(won) : "");
    card.appendChild(e);
    card.onclick = () => startComp(def.id);
    els.compList.appendChild(card);
  }
  showCash();
}

function openComps() {
  bankAndSave();
  mode = "comps";
  releaseLock();
  releaseKeys();
  stopSheets();
  els.title.classList.add("hidden");
  els.pause.classList.add("hidden");
  els.shop.classList.add("hidden");
  els.tricks.classList.add("hidden");
  els.results.classList.add("hidden");
  buildCompList();
  els.comps.classList.remove("hidden");
}

// SETTINGS is its own screen now, reachable from the home screen and from the
// pause menu, rather than two sliders buried in the pause menu. It remembers
// where it was opened FROM, so backing out of it puts you back there.
let settingsFrom = 'title';

function openSettings() {
  settingsFrom = mode === 'pause' ? 'pause' : 'title';
  bankAndSave();
  mode = 'settings';
  releaseLock();
  releaseKeys();
  stopSheets();
  els.title.classList.add('hidden');
  els.pause.classList.add('hidden');
  els.shop.classList.add('hidden');
  els.comps.classList.add('hidden');
  els.tricks.classList.add('hidden');
  els.results.classList.add('hidden');
  els.settings.classList.remove('hidden');
}

function closeSettings() {
  els.settings.classList.add('hidden');
  if (settingsFrom === 'pause' && sk) { mode = 'pause'; els.pause.classList.remove('hidden'); }
  else goHome();
}

function openTricks() {
  bankAndSave();
  mode = "tricks";
  releaseLock();
  releaseKeys();
  els.title.classList.add("hidden");
  els.pause.classList.add("hidden");
  els.shop.classList.add("hidden");
  els.comps.classList.add("hidden");
  els.results.classList.add("hidden");
  els.tricks.classList.remove("hidden");
  setSheetLook(myLook);
  startSheets();
}

function startComp(id) {
  const def = compById(id);
  if (!def) return;
  start(def.park);
  comp = createComp(def, park, sk, score);
  els.comps.classList.add("hidden");
}

// Placing pays. Everything below third pays nothing at all, which is what
// makes the shop expensive.
function showResults() {
  const r = comp.result;
  releaseLock();
  releaseKeys();
  mode = "results";
  if (r.purse > 0) earn(save, r.purse);
  save.podium = save.podium || {};
  const best = save.podium[comp.def.id];
  if (r.place < 3 && (!best || r.place + 1 < best)) save.podium[comp.def.id] = r.place + 1;
  writeSave(save);
  showCash();

  const rows = r.board.map((e, i) =>
    "<tr class='" + (e.you ? "you" : "") + "'><td>" + ordinal(i + 1) + "</td><td>"
    + e.name + "</td><td>" + e.score + "</td></tr>").join("");
  els.resultBody.innerHTML = "<h2>" + comp.def.name + "</h2>"
    + "<p class='tag'>" + (r.cleared ? "course cleared" : "time up") + "</p>"
    + "<table>" + rows + "</table>"
    + "<p class='payout'>" + (r.purse > 0
      ? "YOU PLACED " + ordinal(r.place + 1) + "   " + money(r.purse)
      : "OFF THE PODIUM. NO PAYOUT.") + "</p>";
  els.results.classList.remove("hidden");
}

// ---------------------------------------------------------------------- start
function start(id) {
  park = getPark(id);
  const def0 = PARKS.find((p) => p.id === id);
  endless = !!(def0 && def0.endless);
  runMetres = 0;
  // wrap between the two identical end flats. The seams sit at SEAM and
  // total - SEAM, both well inside those flats and both at the same height.
  wrapLen = endless ? park.total - SEAM * 2 : 0;
  board = createBoard();
  score = createScore(save.best[id] || 0);
  sk = createSkater(park, board, score);
  sk.park = park;
  myLook = look(save);
  cam.x = sk.x - v.W / 2; cam.y = sk.y - v.H * 0.62;
  sk.setLegs(legs(save));
  board.sens = Number(els.sens.value) / 100;
  board.invert = els.invert.checked;
  comp = null;
  mode = 'play';
  stopSheets();
  els.title.classList.add('hidden');
  els.shop.classList.add('hidden');
  els.comps.classList.add('hidden');
  els.tricks.classList.add('hidden');
  els.results.classList.add('hidden');
  els.pause.classList.add('hidden');
  // The curtain goes up, but the mouse is NOT taken. Capturing it is something
  // you do on purpose, by clicking the curtain -- see below.
  offerLock();
}

// CAPTURING THE MOUSE IS ALWAYS SOMETHING YOU ASKED FOR.
//
// Pointer lock hides the cursor and feeds every movement to the page, so a
// browser that has it holds your mouse until it gives it back. Grabbing it on
// anything other than a deliberate click on the curtain means you tab back to
// the game, click once anywhere, and lose the mouse to a window you were not
// trying to play. Starting a run does not take it. Clicking the canvas does not
// take it. Only the curtain takes it.
//
// It is also given back on EVERY way out: escape, losing focus, tabbing away,
// hiding the tab, or leaving the page. And once you let it go it stays gone
// until you click the curtain again -- nothing re-grabs it behind your back.
//
// The curtain itself is the last overlay in the document, so it paints over
// every menu; leaving it up after the lock is lost puts an invisible sheet over
// the pause menu that swallows every click. It is hidden on ANY loss of the
// lock, unconditionally.
function offerLock() {
  // put the curtain up, but do not take anything - EXCEPT on a phone,
  // where there is no pointer to lock and the curtain would be a sheet
  // of glass over the board that never goes away
  els.lock.classList.toggle('hidden', mode !== 'play' || isTouch());
}

function requestLock() {
  if (mode !== 'play') { els.lock.classList.add('hidden'); return; }
  // A PHONE HAS NO POINTER TO LOCK. Asking for it there throws, the
  // catch hides the curtain, and the player is left looking at a game
  // that never starts - so on touch the curtain is skipped entirely and
  // the finger is the board (see ui/touch.js).
  if (isTouch()) { els.lock.classList.add('hidden'); return; }
  els.lock.classList.remove('hidden');
  try {
    const pr = canvas.requestPointerLock && canvas.requestPointerLock();
    if (pr && pr.catch) pr.catch(() => { els.lock.classList.add('hidden'); });
  } catch (e) { els.lock.classList.add('hidden'); }
}
// Nothing stays held across a screen change. A key pressed on one screen and
// released on another would otherwise never see its keyup.
function releaseKeys() {
  held.left = false; held.right = false;
  arrows.up = arrows.down = arrows.left = arrows.right = false;
  padT = 0; padX = 0; padY = 0;
}

function releaseLock() {
  if (document.pointerLockElement) document.exitPointerLock();
  els.lock.classList.add('hidden');
}

// Free skating scores but does NOT pay. Money comes out of competitions only,
// so everything in the shop is something you had to beat somebody for.
function collect() {
  if (score) score.banked = 0;
}

function bankAndSave() {
  if (!score || !park) return;
  score.bank();
  collect();
  const id = PARKS.find((p) => p.name === park.name).id;
  if (score.total > (save.best[id] || 0)) save.best[id] = score.total;
  if (endless && runMetres > (save.far || 0)) save.far = Math.round(runMetres);
  writeSave(save);
}

function goHome() {
  bankAndSave();
  comp = null;
  mode = 'title';
  releaseLock();
  releaseKeys();
  stopSheets();
  els.pause.classList.add('hidden');
  els.shop.classList.add('hidden');
  els.comps.classList.add('hidden');
  els.tricks.classList.add('hidden');
  els.results.classList.add('hidden');
  buildMenu();
  els.title.classList.remove('hidden');
}

function openShop() {
  bankAndSave();
  mode = 'shop';
  releaseLock();
  releaseKeys();
  stopSheets();
  els.title.classList.add('hidden');
  els.pause.classList.add('hidden');
  els.comps.classList.add('hidden');
  els.tricks.classList.add('hidden');
  els.results.classList.add('hidden');
  els.shop.classList.remove('hidden');
  refreshShop();
}

// ---------------------------------------------------------------------- input
document.addEventListener('pointerlockchange', () => {
  const locked = document.pointerLockElement === canvas;
  if (!locked) {
    // ALWAYS, whatever screen we are on. See requestLock above.
    els.lock.classList.add('hidden');
    if (mode === 'play') {
      mode = 'pause';
      els.pause.classList.remove('hidden');
      held.left = held.right = false;
      arrows.up = arrows.down = arrows.left = arrows.right = false;
      bankAndSave();
    }
    return;
  }
  if (mode !== 'play' && mode !== 'pause') { document.exitPointerLock(); return; }
  els.lock.classList.add('hidden');
  if (mode === 'pause') { mode = 'play'; els.pause.classList.add('hidden'); }
});

document.addEventListener('mousemove', (e) => {
  if (document.pointerLockElement !== canvas) return;
  mdx += e.movementX || 0;
  mdy += e.movementY || 0;
});

// The curtain is the ONLY thing that captures the mouse. Clicking the canvas
// used to do it too, which meant any stray click while a run was paused behind
// a menu took the pointer without being asked.
els.lock.addEventListener('click', () => {
  if (mode === 'play') requestLock(); else els.lock.classList.add('hidden');
});

// EVERY WAY OUT gives it back. Tab away, click another window, hide the tab or
// leave the page and the mouse is yours again -- you should never have to hunt
// for the key that frees it.
function dropLock() {
  if (document.pointerLockElement) document.exitPointerLock();
  els.lock.classList.add('hidden');
}
window.addEventListener('blur', dropLock);
window.addEventListener('beforeunload', dropLock);
window.addEventListener('pagehide', dropLock);
document.addEventListener('visibilitychange', () => { if (document.hidden) dropLock(); });

const ARROW = { arrowup: 'up', arrowdown: 'down', arrowleft: 'left', arrowright: 'right' };

window.addEventListener('keydown', (e) => {
  const k = e.key.toLowerCase();
  if (mode !== 'play') return;
  // A and D push. The ARROWS are the keyboard version of the mouse -- they do
  // tricks, not steering, so they are deliberately not aliased onto A/D.
  if (k === 'a') { held.left = true; e.preventDefault(); }
  if (k === 'd') { held.right = true; e.preventDefault(); }
  if (ARROW[k]) { arrows[ARROW[k]] = true; e.preventDefault(); }
  // ON FOOT the arrows are your legs, not the board. Left and right walk, up
  // hops, down crouches -- and there is no board in your hands to flip, so
  // nothing is lost by reusing them. This is the D-pad on a controller.
  if (sk.state === 'walk') {
    if (k === 'arrowup') sk.walkHop();
    if (k === 'arrowdown') sk.walkDuck(true);
  }
  // THE NUMBER KEYS ARE GRABS, and they are a keyboard-only thing. Hold one
  // in the air; the longer you hold it the more it is worth, and the best
  // hold of the jump is the one that counts.
  const pose = poseForKey(k);
  if (pose && sk.grab) { sk.grab(pose); e.preventDefault(); }
  if (k === 'r' && mode === 'play') { score.bail(); sk.respawn(); }
  // S, held in the air, turns the board belly-out so you can look at it. It is
  // not a trick and it pays nothing -- it is the only way to see the graphic
  // you paid for while you are actually skating.
  if (k === 's' && sk.show) { sk.show(true); e.preventDefault(); }
  // SPACE picks the board up and puts it down again. On a pad it is the right
  // trigger. Carrying it is how you get somewhere you cannot ride to.
  if (k === ' ' || k === 'spacebar') { e.preventDefault(); if (sk.toggleCarry) sk.toggleCarry(); }
});
window.addEventListener('keyup', (e) => {
  const k = e.key.toLowerCase();
  if (k === 'arrowdown' && sk && sk.walkDuck) sk.walkDuck(false);
  if (k === 's' && sk && sk.show) sk.show(false);
  const up = poseForKey(k);
  if (up && sk && sk.release) sk.release(up);
  if (k === 'a') held.left = false;
  if (k === 'd') held.right = false;
  if (ARROW[k]) arrows[ARROW[k]] = false;
});

els.sens.addEventListener('input', () => {
  els.sensval.textContent = (Number(els.sens.value) / 100).toFixed(2);
  if (board) board.sens = Number(els.sens.value) / 100;
});
els.invert.addEventListener('change', () => { if (board) board.invert = els.invert.checked; });

// How far a tap of an arrow key throws the cursor. Some people want the
// keyboard to feel like a flick, some want to creep up on a trick.
let padScale = 1;
els.padstr.addEventListener('input', () => {
  padScale = Number(els.padstr.value) / 100;
  els.padstrval.textContent = padScale.toFixed(2);
});

// How far ahead of you the camera sits at speed. At zero it stays centred,
// which some people find easier to read on a long bomb.
let camLead = 1;
els.camlead.addEventListener('input', () => {
  camLead = Number(els.camlead.value) / 100;
  els.camleadval.textContent = camLead.toFixed(2);
});

els.scanlines.addEventListener('change', () => {
  document.body.classList.toggle('noscan', !els.scanlines.checked);
});

els.settingsReset = document.getElementById('settings-reset');
let resetArmed = false;
els.settingsReset.addEventListener('click', () => {
  if (!resetArmed) {
    resetArmed = true;
    els.settingsReset.textContent = 'WIPE EVERYTHING?';
    els.settingsReset.classList.add('hot');
    setTimeout(() => {
      resetArmed = false;
      els.settingsReset.textContent = 'RESET PROGRESS';
      els.settingsReset.classList.remove('hot');
    }, 3000);
    return;
  }
  resetArmed = false;
  els.settingsReset.textContent = 'RESET PROGRESS';
  els.settingsReset.classList.remove('hot');
  resetSave(save);
  myLook = look(save);
  showCash();
  buildMenu();
  buildSheets(els.sheetList, myLook);
  els.settingsNote.textContent = 'WIPED - BACK TO THE STOCK SETUP';
});

document.getElementById('btn-settings').onclick = openSettings;
document.getElementById('pause-settings').onclick = openSettings;
document.getElementById('settings-back').onclick = closeSettings;
document.getElementById('resume').onclick = () => {
  mode = 'play';
  els.pause.classList.add('hidden');
  // The curtain goes up, but the mouse is NOT taken. Capturing it is something
  // you do on purpose, by clicking the curtain -- see below.
  offerLock();
};
document.getElementById('quit').onclick = goHome;
document.getElementById('btn-shop').onclick = openShop;
document.getElementById('pause-shop').onclick = openShop;
document.getElementById('shop-back').onclick = goHome;
document.getElementById('btn-comps').onclick = openComps;
document.getElementById('btn-tricks').onclick = openTricks;
document.getElementById('comps-back').onclick = goHome;
document.getElementById('tricks-back').onclick = goHome;
document.getElementById('pause-comps').onclick = openComps;
document.getElementById('results-ok').onclick = goHome;
document.getElementById('results-again').onclick = () => {
  const id = comp && comp.def.id;
  els.results.classList.add('hidden');
  if (id) startComp(id);
};

// ----------------------------------------------------------------------- loop
let last = performance.now();
let msWork = 0;
function frame(now) {
  const t0 = performance.now();
  // the pad belongs to a RUN, not to the game: it would sit over the shop
  // otherwise, and its own guard already refuses input off a run
  if (pad) pad.show(mode === 'play');
  // the portal only counts you as playing while you are actually skating
  portal.setPlaying(mode === 'play');
  let dt = (now - last) / 1000;
  last = now;
  if (dt > 1 / 25) dt = 1 / 25;
  clock += dt;

  if (mode === 'play') {
    const pd = padDelta(dt);
    board.feed(mdx, mdy, pd[0], pd[1]);
    mdx = 0; mdy = 0;
    sk.input = (held.right ? 1 : 0) + (held.left ? -1 : 0);
    // on foot the D-pad walks you too, so you never have to reach for A/D
    if (sk.state === 'walk' && !sk.input) {
      sk.input = (arrows.right ? 1 : 0) + (arrows.left ? -1 : 0);
    }
    sk.update(dt);
    collect();
    collectCoins();
    if (sk.grabPaid) {
      const got = earn(save, sk.grabPaid);
      sk.grabPaid = 0;
      score.add('GRAB ' + money(got), 0);
      showCash();
    }
    if (comp && !comp.over) {
      comp.update(dt);
      if (comp.over) showResults();
    } else if (!comp) {
      score.events.length = 0;
    }
    if (endless) cityRun(dt);
    follow(dt);
  } else {
    mdx = 0; mdy = 0;
  }

  render();
  msWork += ((performance.now() - t0) - msWork) * 0.05;
  requestAnimationFrame(frame);
}

// The endless run is one very long street whose two ends are the same flat at
// the same height, so sliding the skater a whole lap back is invisible. The
// camera slides with them, or it spends a second lerping across the whole map.
function cityRun(dt) {
  runMetres += Math.abs(sk.v) * dt / 12;
  if (sk.state !== 'ride') return;
  if (sk.s > SEAM + wrapLen) { sk.s -= wrapLen; slide(-wrapSpan()); }
  else if (sk.s < SEAM) { sk.s += wrapLen; slide(wrapSpan()); }
}
function wrapSpan() { return park.posAt(SEAM + wrapLen).x - park.posAt(SEAM).x; }
function slide(dx) {
  const q = park.posAt(sk.s);
  sk.x = q.x; sk.y = q.y;
  cam.x += dx;
}

function follow(dt) {
  const lookX = Math.max(-70, Math.min(70, (sk.state === 'air' ? sk.vx : sk.v) * 0.34)) * camLead;
  const tx = sk.x - v.W / 2 + lookX;
  const ty = sk.y - v.H * 0.60 - (sk.state === 'air' ? 14 : 0);
  const k = Math.min(1, dt * (sk.state === 'air' ? 5.5 : 4.2));
  cam.x += (tx - cam.x) * k;
  cam.y += (ty - cam.y) * k;
  cam.x = Math.max(park.minX - 30, Math.min(park.maxX + 30 - v.W, cam.x));
  cam.y = Math.min(park.maxY + 60 - v.H, cam.y);
  v.cam.x = cam.x; v.cam.y = cam.y;
}

// --------------------------------------------------------------------- render
function render() {
  if (mode !== 'play' && mode !== 'pause') {
    v.clear('#17131c');
    v.present();
    return;
  }
  const theme = PARKS.find((p) => p.name === park.name).theme;

  v.ui();
  drawSky(v, theme, cam.x, cam.y);
  drawParallax(v, park, theme, cam.x, cam.y, clock);

  v.begin();
  drawDecor(v, park, theme, true, clock);
  drawTerrain(v, park, theme);
  drawRails(v, park);
  drawDecor(v, park, theme, false, clock);
  drawCoins(v, park, clock);

  drawTargets(v, comp, park, sk, clock);
  shadow();
  drawRider();
  if (!window.__nochrome) weightCursor();
  particles();

  // CHROME OFF, for the store shots.
  //
  // A CrazyGames cover may not carry a HUD, and the weight cursor is a
  // player aid rather than part of the world - so the capture rig turns
  // both off rather than trying to crop or paint over them. It is one
  // flag and it is never set during play.
  if (!window.__nochrome) {
    drawHud(v, sk, board, score, park, clock, save.cash, endless ? runMetres : -1);
    drawCompHud(v, comp, score);
  }
  v.present();
}

// The shadow is an ellipse laid ON the surface, in the surface's own dark
// shades rather than a translucent black blob -- it reads as ambient occlusion
// in the concrete instead of a sticker floating over it. It follows the slope,
// shrinks with height, and narrows as the deck turns side-on.
function shadow() {
  const hit = park.hitGround(sk.x, sk.y - 3, sk.x, sk.y + 300);
  if (!hit) return;
  const drop = Math.max(0, Math.hypot(hit.x - sk.x, hit.y - sk.y) - 5);
  if (drop > 170) return;
  const t = 1 - Math.min(1, drop / 150);
  const seg = hit.seg;
  const m = matRamp(seg.mat);
  const near = t > 0.5;
  const soft = near ? m[3] : m[2];
  const core = near ? m[4] : m[3];

  const yawSquash = 0.55 + 0.45 * Math.abs(Math.cos(board.yaw));
  const w = (4.5 + 8 * t) * yawSquash;
  const h = 1.3 + 1.9 * t;
  const cx = hit.x + seg.nx * 0.5, cy = hit.y + seg.ny * 0.5;

  const ell = (rw, rh) => {
    const pts = [];
    for (let i = 0; i < 14; i++) {
      const a = i / 14 * Math.PI * 2;
      const px = Math.cos(a) * rw, py = Math.sin(a) * rh;
      pts.push([cx + px * seg.tx + py * seg.nx, cy + px * seg.ty + py * seg.ny]);
    }
    return pts;
  };
  v.poly(ell(w, h), soft);
  if (t > 0.3) v.poly(ell(w * 0.62, h * 0.62), core);
}

// Your weight, drawn out in the world where you are actually looking, orbiting
// the rider. The HUD pad tells you what the zones mean; this tells you where
// your hand is without taking your eyes off the skater.
const CURSOR_R = 20;
function weightCursor() {
  const cx = sk.x, cy = sk.y - 46;   // floats above the rider, never over them
  const px = cx + board.r * CURSOR_R;
  const py = cy + board.p * CURSOR_R;
  const home = board.settled > 0.5;

  // home ring
  v.ring(cx, cy, Math.round(board.K.centre * CURSOR_R), home ? P.good : P.ink3);
  if (!home) {
    v.line(cx, cy, px, py, P.ink3);
  }
  const col = home ? P.good : board.gestureT > 0 ? P.ui1 : P.ui4;
  v.disc(px, py, 4, P.ink);
  v.disc(px, py, 2, col);
  // a little crosshair so it never gets lost against the concrete
  v.rect(px - 5, py, 3, 1, col); v.rect(px + 3, py, 3, 1, col);
  v.rect(px, py - 5, 1, 3, col); v.rect(px, py + 3, 1, 3, col);
  if (board.catching > 0.05) v.ring(px, py, 6 + board.catching * 5, P.ui3);
}

// WHAT A COLLECTIBLE IS WORTH. Forty of them in the city, so a clean lap of
// the whole map is about what one third place in a comp pays -- it is a grind
// on purpose, and it is the reason to be in the city at all.
const COIN = 45;

function collectCoins() {
  if (!park.coins || !park.coins.length) return;
  for (const c of park.coins) {
    if (c.taken) continue;
    const dx = sk.x - c.x, dy = (sk.y - 14) - c.y;
    if (dx * dx + dy * dy > 26 * 26) continue;
    c.taken = true;
    const got = earn(save, COIN);
    score.add('PICKED UP ' + money(got), 0);
    showCash();
    for (let i = 0; i < 8; i++) {
      const a = Math.random() * Math.PI * 2;
      sk.sparks.push({
        x: c.x, y: c.y, vx: Math.cos(a) * 70, vy: Math.sin(a) * 70 - 40, life: 0.4,
      });
    }
  }
}

function drawRider() {
  const ang = sk.state === 'bail' ? sk.ang + sk.bailSpin : sk.ang;
  const c = Math.cos(ang), s = Math.sin(ang);
  const bx = sk.x + 4.6 * s, by = sk.y - 4.6 * c;
  const flip = sk.dir < 0;
  const deckLook = myLook.deck;

  if (sk.state === 'bail') {
    drawBoard(v, bx + Math.cos(clock * 7) * 12, by + 6, sk.bailSpin * 2, sk.bailSpin,
      -sk.bailSpin * 3, DECK, { flip, look: deckLook });
    drawSkater(v, sk, board, clock, null, myLook);
    return;
  }
  // On a rail the deck's display angle lives on the grind, not on the board.
  const yaw = sk.state === 'grind' ? sk.grind.yaw : board.yaw;
  // Lining the deck up with the slope takes MINUS the surface angle: the pitch
  // parameter turns the deck counter-clockwise in MODEL space (y up) while a
  // surface angle is measured in SCREEN space (y down).
  //
  // And it flips again when the rider does. Facing left is drawn as a
  // screen-space mirror, and mirroring turns a counter-clockwise rotation into
  // a clockwise one -- so skating left up a ramp pointed the nose downhill.
  // The deck's OWN rotation should mirror with it; only the world alignment
  // has to be corrected.
  const surface = flip ? ang : -ang;
  // CARRIED, the board is TUCKED UNDER THE ARM: lying along its length at
  // armpit height, tilted a little nose-down, with its underside turned out to
  // the camera. Stood on its tail beside the hip -- which is what it did first
  // -- reads as a shop mannequin holding a plank.
  //
  // And it does not snap between the two. sk.mount eases 0..1 while the rider
  // picks it up or steps back onto it, and every number here rides that blend,
  // so the board swings up under the arm instead of teleporting there.
  const m = sk.mount || 0;
  const carried = m > 0.002;
  const side = flip ? 1 : -1;
  const lerp = (a2, b2) => a2 + (b2 - a2) * m;
  // HELD OUT TO BE LOOKED AT. A quarter turn about the long axis brings the
  // belly square to the camera -- the same angle the shop uses to show you a
  // print -- and it is a DISPLAY angle only. The board's own roll counter is
  // untouched, so turning it over to admire it never counts as a flip.
  const show = sk.showT || 0;
  const SHOW_ROLL = -Math.PI / 2 - 0.34 + 0.06;
  const held = (a2, b2) => a2 + (b2 - a2) * show;

  const deck = () => {
    // where it sits: under your feet at m=0, under your arm at m=1
    const cx = lerp(bx, sk.x + side * 1.4);
    const cy = lerp(by, sk.y - 12.2);
    // and how it is held. The roll turns its belly to the camera; the pitch is
    // the slight nose-down angle of something tucked into your side.
    const roll = held(lerp(board.roll, -Math.PI / 2 - 0.34), SHOW_ROLL);
    const yw = held(lerp(yaw, 0), 0);
    const pit = held(lerp(board.pitch + surface, -side * 0.30 + surface * 0.3), 0);
    // and it comes out to arm's length, clear of the rider
    drawBoard(v, cx - side * 8 * show, cy - 12 * show, roll, yw, pit, DECK,
      { flip, look: deckLook });
  };
  // Under your feet the deck belongs BETWEEN the far leg and the near one, so
  // the rig reads as standing on it. Once it has been kicked up past you it
  // belongs in front of everything, or a flip looks like it is happening
  // inside your shins.
  if ((sk.state === 'air' && sk.airTime > 0.12) || show > 0.5) {
    drawSkater(v, sk, board, clock, null, myLook);
    deck();
  } else drawSkater(v, sk, board, clock, deck, myLook);
}

function particles() {
  for (const q of sk.sparks) {
    if (q.kind === 'spark') {
      v.rect(q.x, q.y, 2, 1, q.life > 0.12 ? '#fff3c4' : P.ui2);
    } else {
      const a = q.life / 0.45;
      v.rect(q.x, q.y, a > 0.5 ? 2 : 1, a > 0.5 ? 2 : 1, a > 0.6 ? P.con1 : P.con3);
    }
  }
}

// ----------------------------------------------------------------------- boot
const restyle = () => {
  myLook = look(save);
  if (sk && sk.setLegs) sk.setLegs(legs(save));
  showCash();
  if (els.homePreview) drawRiderPreview(els.homePreview, myLook);
};
// the second callback fires after a wipe, when best times and comps go too
buildShop(save, restyle, () => { restyle(); buildSheets(els.sheetList, myLook); buildMenu(); });
buildSheets(els.sheetList, myLook);
buildMenu();
els.sensval.textContent = (Number(els.sens.value) / 100).toFixed(2);
requestAnimationFrame(frame);

// ---------------------------------------------------------------- touch
//
// The pad is built once and shown only during a run. Everything it does
// goes through the same variables the keyboard and mouse write to, so
// there is no second input path to keep in step - and `playing()` is the
// one guard that stops a thumb on the menu counting as a flick.
const pad = installTouch(canvas, {
  move(dx, dy) { mdx += dx; mdy += dy; },
  push(side, on) { held[side] = on; },
  grab(on) {
    if (!sk) return;
    // one pad, and it holds whatever grab the board is set up for -
    // five separate grab buttons on a phone is five things to miss
    const pose = poseForKey('1');
    if (on) { if (sk.grab && pose) sk.grab(pose); }
    else if (sk.release && pose) sk.release(pose);
  },
  carry() { if (sk && sk.toggleCarry) sk.toggleCarry(); },
  bail() { if (mode === 'play' && score) { score.bail(); sk.respawn(); } },
  pause() {
    if (mode !== 'play') return;
    mode = 'pause';
    els.pause.classList.remove('hidden');
    releaseKeys();
    bankAndSave();
  },
  playing() { return mode === 'play'; },
});

// ---------------------------------------------------------- the portal
//
// A no-op off CrazyGames. `gameplayStart` is REQUIRED for a full launch
// and it has to mean actually skating, not sitting in the shop - which
// `mode` already knows, so there is exactly one call site.
portal.init();

// a tiny hook so the game can be poked at from the console and by the tests
window.GC = {
  pad, isTouch,
  start, openShop, goHome, openComps, openTricks, startComp,
  get comp() { return comp; },
  get ms() { return msWork; },
  get park() { return park; }, get sk() { return sk; }, get board() { return board; },
  get score() { return score; }, get save() { return save; }, get look() { return myLook; },
  feed(dx, dy) { mdx += dx; mdy += dy; },
  key(name, down) { if (name in arrows) arrows[name] = down; },
  gearList(kind) { return GEAR[kind]; },
  slotFor(id) { for (const k of Object.keys(GEAR)) if (GEAR[k].some((g) => g.id === id)) return k; return null; },
  riderFacing,
  PARKS, v, text,
};
