// Boot, input, loop, menus and the shop.
import { newGame, startShift, step, throwAt, fast, UPG, upCost, shiftTarget } from './game.js';
import { draw } from './render.js';
import * as A from './audio.js';

const Q = new URLSearchParams(location.search);
const KEY = 'pizzapanic.v1';
const fresh = () => ({ bank: 0, shift: 1, best: 0, total: 0, up: { engine: 0, boost: 0, bag: 0, size: 0, arm: 0 } });
function load() { try { const s = JSON.parse(localStorage.getItem(KEY)); if (s && s.up) return { ...fresh(), ...s, up: { ...fresh().up, ...s.up } }; } catch (e) {} return fresh(); }
function save() { try { localStorage.setItem(KEY, JSON.stringify(G.save)); } catch (e) {} }
if (Q.has('reset')) try { localStorage.removeItem(KEY); } catch (e) {}
if (Q.has('mute')) A.setMuted(true);

const cv = document.getElementById('c'), ctx = cv.getContext('2d');
const $ = (id) => document.getElementById(id);
const touch = Q.has('touch') || matchMedia('(pointer: coarse)').matches;
let w = 0, h = 0, dpr = 1;
function resize() { dpr = Math.min(2, window.devicePixelRatio || 1); w = innerWidth; h = innerHeight; cv.width = w * dpr; cv.height = h * dpr; cv.style.width = w + 'px'; cv.style.height = h + 'px'; }
addEventListener('resize', resize); resize();

let G = newGame(load(), { bot: Q.has('bot'), seed: +Q.get('seed') || 1234 });
const cam = { x: G.city.pizza.x, y: G.city.pizza.y, s: 1 };
window.__G = { get G() { return G; }, fast: (s) => fast(G, s), throwAt: (x, y) => throwAt(G, x, y), start: () => begin(), shop: buy, get state() { return G.state; } };

// ---------- input ----------
const keys = new Set(); let mouse = null, mouseDown = false;
addEventListener('keydown', (e) => {
  A.wake(); keys.add(e.code);
  if (e.code === 'Space' || e.code.startsWith('Arrow')) e.preventDefault();
  if ((e.code === 'Escape' || e.code === 'KeyP') && (G.state === 'play' || G.state === 'paused')) togglePause();
  if (e.code === 'KeyM') { A.setMuted(!A.isMuted()); }
  if (e.code === 'Enter' && G.state === 'result') $('cGo').click();
  if (e.code === 'KeyE' || e.code === 'KeyF') throwForward();
});
addEventListener('keyup', (e) => keys.delete(e.code));
addEventListener('blur', () => keys.clear());
cv.addEventListener('mousemove', (e) => { mouse = { x: e.clientX, y: e.clientY }; });
cv.addEventListener('mousedown', (e) => { A.wake(); mouse = { x: e.clientX, y: e.clientY }; if (e.button === 0) { mouseDown = true; const p = toWorld(mouse.x, mouse.y); throwAt(G, p.x, p.y); } });
addEventListener('mouseup', () => (mouseDown = false));
cv.addEventListener('contextmenu', (e) => e.preventDefault());
const toWorld = (x, y) => ({ x: (x - w / 2) / cam.s + cam.x, y: (y - h / 2) / cam.s + cam.y });
function throwForward() { const p = G.p; let best = null, bd = 1e9; for (const o of G.orders) { const d = Math.hypot(o.door.x - p.x, o.door.y - p.y); if (d < bd) { bd = d; best = o; } } if (best && bd < G.range + 60) throwAt(G, best.door.x, best.door.y); else throwAt(G, p.x + Math.cos(p.a) * 200, p.y + Math.sin(p.a) * 200); }

// touch: left half = floating stick, right half = tap to throw, buttons for boost/drift
const stick = { id: null, ox: 0, oy: 0, x: 0, y: 0 }; let tBoost = false, tDrift = false;
if (touch) {
  $('touch').classList.remove('hidden');
  const btn = (el, set) => { el.addEventListener('touchstart', (e) => { e.preventDefault(); e.stopPropagation(); A.wake(); set(true); }, { passive: false }); el.addEventListener('touchend', (e) => { e.preventDefault(); set(false); }); el.addEventListener('touchcancel', () => set(false)); };
  btn($('tBoost'), (v) => (tBoost = v)); btn($('tDrift'), (v) => (tDrift = v));
  cv.addEventListener('touchstart', (e) => {
    e.preventDefault(); A.wake();
    for (const t of e.changedTouches) {
      if (t.clientX < w * 0.5 && stick.id === null) { Object.assign(stick, { id: t.identifier, ox: t.clientX, oy: t.clientY, x: t.clientX, y: t.clientY }); }
      else { const p = toWorld(t.clientX, t.clientY); throwAt(G, p.x, p.y); }
    }
  }, { passive: false });
  cv.addEventListener('touchmove', (e) => { e.preventDefault(); for (const t of e.changedTouches) if (t.identifier === stick.id) { stick.x = t.clientX; stick.y = t.clientY; } }, { passive: false });
  const end = (e) => { for (const t of e.changedTouches) if (t.identifier === stick.id) stick.id = null; };
  cv.addEventListener('touchend', end); cv.addEventListener('touchcancel', end);
}
function readInput() {
  const I = G.input; if (G.bot) return;
  const k = (...c) => c.some((x) => keys.has(x));
  I.thr = (k('KeyW', 'ArrowUp') ? 1 : 0) - (k('KeyS', 'ArrowDown') ? 1 : 0);
  I.steer = (k('KeyD', 'ArrowRight') ? 1 : 0) - (k('KeyA', 'ArrowLeft') ? 1 : 0);
  I.hb = k('Space') || tDrift; I.boost = k('ShiftLeft', 'ShiftRight') || tBoost; I.head = null;
  if (stick.id !== null) {
    const dx = stick.x - stick.ox, dy = stick.y - stick.oy, L = Math.hypot(dx, dy);
    if (L > 12) { I.head = Math.atan2(dy, dx); I.thr = Math.min(1, L / 60); } else I.thr = 0;
    $('knob').style.transform = `translate(${Math.max(-50, Math.min(50, dx))}px, ${Math.max(-50, Math.min(50, dy))}px)`;
    $('stick').style.cssText = `left:${stick.ox - 60}px;top:${stick.oy - 60}px;opacity:1`;
  } else if (touch) { $('stick').style.opacity = '0.35'; $('stick').style.cssText = 'opacity:.35'; $('knob').style.transform = ''; }
}

// ---------- screens ----------
function begin() { hideAll(); startShift(G); cam.x = G.p.x; cam.y = G.p.y; A.musicLevel(0.15); }
function hideAll() { for (const id of ['title', 'card']) $(id).classList.add('hidden'); }
function togglePause() {
  if (G.state === 'play') { G.state = 'paused'; showCard('PAUSED', '<p>Take a breath. The pizzas are not cooling while you wait.</p>', 'RESUME', () => { G.state = 'play'; hideAll(); }); }
  else if (G.state === 'paused') { G.state = 'play'; hideAll(); }
}
function showCard(title, html, go, onGo, shop = false) {
  $('cTitle').textContent = title; $('cStats').innerHTML = html; $('cGo').textContent = go; $('cGo').onclick = () => { A.wake(); A.sfx('click'); onGo(); };
  $('shop').classList.toggle('hidden', !shop); if (shop) renderShop();
  $('card').classList.remove('hidden');
}
function renderShop() {
  const s = G.save;
  $('shop').innerHTML = `<div class="bank">Bank <b>$${s.bank}</b></div>` + Object.entries(UPG).map(([k, u]) => {
    const l = s.up[k], maxed = l >= u.max, c = upCost(k, l);
    return `<button class="up" data-k="${k}" ${maxed || s.bank < c ? 'disabled' : ''}><span class="un">${u.name}</span><span class="ud">${u.desc}</span><span class="pips">${'<i class="on"></i>'.repeat(l)}${'<i></i>'.repeat(u.max - l)}</span><span class="uc">${maxed ? 'MAX' : '$' + c}</span></button>`;
  }).join('');
  for (const b of $('shop').querySelectorAll('.up')) b.onclick = () => buy(b.dataset.k);
}
function buy(k) {
  const s = G.save, l = s.up[k], c = upCost(k, l);
  if (l >= UPG[k].max || s.bank < c) return false;
  s.bank -= c; s.up[k]++; save(); A.wake(); A.sfx('buy'); renderShop(); return true;
}
function showResult() {
  const r = G.result; save();
  const html = `<div class="big ${r.win ? 'win' : 'lose'}">$${r.cash} <small>of $${r.target}</small></div>
    <div class="grid"><span>Deliveries</span><b>${r.deliv}</b><span>Long shots</span><b>${r.bull}</b><span>Near misses</span><b>${r.near}</b><span>Best combo</span><b>${r.best}</b><span>Missed / stolen</span><b>${r.miss} / ${r.stolen}</b>${r.bonus ? `<span>Target bonus</span><b>+$${r.bonus}</b>` : ''}</div>
    <p class="hint">${r.win ? 'Next shift: more traffic, ' + (G.save.shift >= 2 ? 'rival "RAT" scooters that ram pizzas off your rack (watch for the red ! and BOOST into them first for a TAKEDOWN), ' : '') + 'target $' + shiftTarget(G.save.shift) + '.' : 'Tips: hug cars for NEAR MISS cash, drift to refill boost, throw from far away for LONG SHOT x1.5.'}</p>`;
  showCard(r.win ? 'SHIFT ' + r.shift + ' COMPLETE!' : 'SHIFT FAILED', html, r.win ? 'NEXT SHIFT' : 'RETRY SHIFT', begin, true);
  A.musicLevel(0.07);
}
$('play').onclick = () => { A.wake(); A.sfx('click'); begin(); };
$('cMenu').onclick = () => { A.sfx('click'); hideAll(); G.state = 'title'; $('title').classList.remove('hidden'); };

// first visit lands straight in a shift; ?title shows the menu
if (Q.has('title')) { G.state = 'title'; startShift(G); G.state = 'title'; $('title').classList.remove('hidden'); }
else begin();

// ---------- loop ----------
let last = performance.now(), acc = 0;
function frame(now) {
  const dt = Math.min(0.1, (now - last) / 1000); last = now;
  readInput();
  if (G.state === 'play') {
    if (mouseDown && G.throwCd <= 0 && mouse) { const p = toWorld(mouse.x, mouse.y); throwAt(G, p.x, p.y); }
    acc += dt; while (acc >= 1 / 60) { step(G, 1 / 60); acc -= 1 / 60; }
  } else acc = 0;
  if (G.state === 'result' && $('card').classList.contains('hidden')) showResult();
  // camera: lead the scooter, zoom out with speed
  const p = G.p, spd = Math.hypot(p.vx, p.vy), base = Math.min(w, h) / (touch ? 540 : 600);
  const ts = base * (1.12 - Math.min(0.3, spd / 2000));
  cam.s += (ts - cam.s) * Math.min(1, dt * 2);
  const lx = p.x + p.vx * 0.38, ly = p.y + p.vy * 0.38, kc = Math.min(1, dt * 5);
  cam.x += (lx - cam.x) * kc; cam.y += (ly - cam.y) * kc;
  A.engine(spd, p.boosting, G.state === 'play');
  draw(ctx, G, cam, w, h, dpr, mouse ? toWorld(mouse.x, mouse.y) : null, touch);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
