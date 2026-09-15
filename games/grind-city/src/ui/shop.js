// The shop screen.
//
// Layout: the CHARACTER is the main display, big, with the underside of the
// deck shown next to them; the gear list is a sidebar. You are looking at
// yourself, not at a catalogue.
//
// The previews use the same pixel renderer the game does, so what stands in the
// shop is literally the rider that goes in the park.
//
// Tapping a thing you do not own TRIES IT ON. The rider wears it, the board
// preview shows it, and a second tap buys it -- nobody should have to spend
// competition money to find out what a jacket looks like.
//
// Buy the custom deck, grip or wheels and a PRINTER appears under the previews.
// It edits the design in place -- there is nothing to confirm and nothing to
// lock, so you can repaint whenever you like and watch it change as you go.

import { createView } from '../render/view.js';
import { drawSkater } from '../art/skater.js';
import { drawBoard } from '../art/board3d.js';
import { P, THEMES } from '../art/palette.js';
import { CATEGORIES, GEAR, PRINT_COLORS, gridSize } from '../game/shop.js';
import {
  owns, buy, equip, look, paint, clearPrint, printing,
  gridOf, truckColours, setTruckColour, fillFrom, resetSave,
} from '../game/wardrobe.js';

let SAVE = null;
let onChange = null;
let onReset = null;
let active = 'body';
let brush = 1;
let chip = -1;         // a truck colour the palette is aimed at, or -1 for the grid
let trying = null;     // { kind, id } you are wearing but have not paid for
let bucket = false;    // the next tap FILLS instead of painting one cell
let brushSize = 1;     // how many cells across the brush lays down
let turning = false;   // the rider view has focus and A/D will turn them
let facing = 0;        // which way the rider is turned, in radians
let els = null;

export function buildShop(save, changed, reset) {
  SAVE = save;
  onChange = changed;
  onReset = reset;
  els = {
    tabs: document.getElementById('shop-tabs'),
    grid: document.getElementById('shop-grid'),
    rider: document.getElementById('shop-rider'),
    turnHint: document.getElementById('turn-hint'),
    board: document.getElementById('shop-board'),
    note: document.getElementById('shop-note'),
    printer: document.getElementById('printer'),
    plabel: document.getElementById('print-label'),
    pgrid: document.getElementById('print-grid'),
    pchips: document.getElementById('print-chips'),
    ppal: document.getElementById('print-palette'),
    pclear: document.getElementById('print-clear'),
    pfill: document.getElementById('print-fill'),
    pnib: document.getElementById('print-nib'),
    reset: document.getElementById('shop-reset'),
    blabel: document.getElementById('board-label'),
    bview: document.getElementById('board-view'),
  };

  els.tabs.innerHTML = '';
  for (const cat of CATEGORIES) {
    const b = document.createElement('button');
    b.className = 'tab';
    b.textContent = cat.name;
    b.dataset.key = cat.key;
    b.onclick = () => { active = cat.key; chip = -1; trying = null; boardView = viewFor2(cat.key); refreshShop(); };
    els.tabs.appendChild(b);
  }

  buildPrinter();
  buildBoardView();
  buildTurntable();
  buildReset();
  refreshShop();
}

export function setSave(save) { SAVE = save; refreshShop(); }

export function refreshShop() {
  if (!els) return;
  for (const b of els.tabs.children) b.classList.toggle('on', b.dataset.key === active);

  els.grid.innerHTML = '';
  for (const g of GEAR[active]) els.grid.appendChild(gearCard(g));

  refreshPrinter();
  drawPreviews();
}

function gearCard(g) {
  const owned = owns(SAVE, active, g.id);
  const worn = SAVE.equip[active] === g.id;
  const onTrial = !!trying && trying.kind === active && trying.id === g.id;
  const card = document.createElement('div');
  card.className = 'gear' + (worn ? ' worn' : '') + (owned ? ' owned' : '')
    + (onTrial ? ' trying' : '');
  card.dataset.id = g.id;
  card.appendChild(swatch(swatchColors(active, g)));

  const b = document.createElement('b'); b.textContent = g.name; card.appendChild(b);
  if (g.tag) { const s = document.createElement('small'); s.textContent = g.tag; card.appendChild(s); }
  const e = document.createElement('em');
  const paintable = g.custom || g.graphic === 'custom';
  e.textContent = onTrial ? 'TRYING IT ON - TAP TO BUY ' + money(g.price)
    : worn ? (paintable ? 'WEARING - PAINT IT BELOW' : 'WEARING')
      : owned ? 'OWNED - TAP TO WEAR' : money(g.price) + ' - TAP TO TRY';
  if (!owned && SAVE.cash < g.price) e.classList.add('poor');
  card.appendChild(e);

  card.onclick = () => pick(g);
  return card;
}

function swatch(cols) {
  const sw = document.createElement('div');
  sw.className = 'swatch';
  for (const c of cols) {
    const d = document.createElement('i');
    d.style.background = c || 'repeating-linear-gradient(45deg,#3a3444,#3a3444 3px,#262030 3px,#262030 6px)';
    sw.appendChild(d);
  }
  return sw;
}

// Which way the board panel is facing. Deck and grip want the underside; wheels
// want it side on, because you cannot see a wheel from below.
let boardView = 'under';
function viewFor2(kind) { return kind === 'wheels' ? 'side' : 'under'; }

function drawPreviews() {
  const L = trialLook();
  drawRiderPreview(els.rider, L, { big: true, spin: facing });
  if (boardView === 'side') drawBoardSide(els.board, L);
  else drawBoardFace(els.board, L);
  if (els.blabel) {
    els.blabel.textContent = boardView === 'side' ? 'YOUR SETUP, SIDE ON' : 'BOTTOM OF THE BOARD';
  }
  if (els.bview) els.bview.textContent = boardView === 'side' ? 'SHOW THE PRINT' : 'SHOW THE WHEELS';
}

// The look you SEE, which is what you own plus whatever you are trying on. It
// never touches the save, so walking away costs nothing.
function trialLook() {
  if (!trying) return look(SAVE);
  const was = SAVE.equip[trying.kind];
  SAVE.equip[trying.kind] = trying.id;
  const L = look(SAVE);
  SAVE.equip[trying.kind] = was;
  return L;
}

function pick(g) {
  if (!owns(SAVE, active, g.id)) {
    // first tap tries it on, second tap pays for it
    if (!trying || trying.kind !== active || trying.id !== g.id) {
      trying = { kind: active, id: g.id };
      note('TRYING ON ' + g.name + ' - TAP AGAIN TO BUY');
      refreshShop();
      return;
    }
    if (buy(SAVE, active, g.id) === 'poor') { note('NOT ENOUGH CASH - GO WIN A COMP'); return; }
    note('BOUGHT ' + g.name);
  }
  trying = null;
  equip(SAVE, active, g.id);
  if (onChange) onChange();
  refreshShop();
}

function note(msg) {
  if (!els || !els.note) return;
  els.note.textContent = msg;
  els.note.classList.add('flash');
  setTimeout(() => { if (els && els.note) els.note.classList.remove('flash'); }, 1200);
}

function money(n) { return String.fromCharCode(36) + n; }

function swatchColors(kind, g) {
  if (kind === 'deck') return g.art;
  if (kind === 'grip') return g.grip;
  if (kind === 'wheels') return [g.wheels[0], g.wheels[1], g.trucks[0]];
  if (kind === 'shoes') return [g.c[0] || null, g.c[1] || null, g.sole];
  if (kind === 'body' || kind === 'hairstyle') return ['#6d92cf', '#4a6aa5', '#31486f'];
  return g.c;
}

// --- the printer --------------------------------------------------------------
function buildBoardView() {
  if (!els.bview) return;
  els.bview.onclick = () => {
    boardView = boardView === 'side' ? 'under' : 'side';
    drawPreviews();
  };
}

// The grid is rebuilt whenever the category changes, because a deck is 15x6
// and a wheel face is 5x5. Cells are buttons so dragging across them paints.
let gridKind = null;

function buildPrinter() {
  if (!els.pgrid) return;
  els.ppal.innerHTML = '';
  PRINT_COLORS.forEach((c, i) => {
    const b = document.createElement('button');
    b.className = 'pcol';
    b.dataset.i = i;
    b.style.background = c || 'repeating-linear-gradient(45deg,#4a3a53,#4a3a53 3px,#2a2131 3px,#2a2131 6px)';
    b.title = c || 'leave the base colour';
    b.onclick = () => {
      if (chip >= 0) { setTruckColour(SAVE, chip, i); after(); return; }
      brush = i;
      refreshPrinter();
    };
    els.ppal.appendChild(b);
  });

  els.pclear.onclick = () => { clearPrint(SAVE, active); after(); };
  if (els.pfill) {
    els.pfill.onclick = () => { bucket = !bucket; refreshPrinter(); };
  }

  // THE NIB. Four sizes, because six hundred and forty cells is a canvas you
  // want to block in before you detail it.
  if (els.pnib) {
    els.pnib.innerHTML = '';
    for (const n of [1, 2, 3, 5]) {
      const b = document.createElement('button');
      b.className = 'nib' + (n === brushSize ? ' on' : '');
      b.dataset.n = n;
      b.innerHTML = '<i style="width:' + (n * 2 + 2) + 'px;height:' + (n * 2 + 2) + 'px"></i>';
      b.title = n + ' x ' + n;
      b.onclick = () => { brushSize = n; bucket = false; refreshPrinter(); };
      els.pnib.appendChild(b);
    }
  }
}

function after() {
  refreshPrinter(); drawPreviews(); if (onChange) onChange();
}

function buildGrid(kind) {
  const g = gridSize(kind);
  els.pgrid.style.gridTemplateColumns = 'repeat(' + g.cols + ', 1fr)';
  els.pgrid.classList.toggle('wide', g.cols > 8);
  els.pgrid.innerHTML = '';
  for (let i = 0; i < g.cols * g.rows; i++) {
    const cell = document.createElement('button');
    cell.className = 'pcell';
    cell.dataset.i = i;
    const put = () => {
      chip = -1;
      if (bucket) fillFrom(SAVE, kind, i, brush);
      else paint(SAVE, kind, i, brush, brushSize);
      after();
    };
    cell.onmousedown = put;
    // dragging paints, but it must never drag a BUCKET across the grid
    cell.onmouseenter = (ev) => { if (ev.buttons === 1 && !bucket) put(); };
    els.pgrid.appendChild(cell);
  }
  gridKind = kind;
}

function refreshPrinter() {
  if (!els.printer) return;
  // it only appears when the thing you are WEARING is the one you paint
  const on = printing(SAVE, active);
  els.printer.classList.toggle('hidden', !on);
  if (!on) return;
  if (gridKind !== active) buildGrid(active);

  const what = active === 'deck' ? 'THE BOTTOM OF YOUR BOARD'
    : active === 'grip' ? 'YOUR GRIPTAPE' : 'YOUR WHEEL FACES';
  els.plabel.textContent = what + (bucket ? ' - TAP TO FILL' : ' - DRAG TO PAINT');
  if (els.pfill) {
    els.pfill.textContent = bucket ? 'BUCKET ON' : 'BUCKET';
    els.pfill.classList.toggle('hot', bucket);
  }
  els.pgrid.classList.toggle('bucket', bucket);
  if (els.pnib) {
    els.pnib.classList.remove('hidden');
    for (const b of els.pnib.children) b.classList.toggle('on', (b.dataset.n | 0) === brushSize);
  }

  const grid = gridOf(SAVE, active);
  for (const cell of els.pgrid.children) {
    cell.style.background = PRINT_COLORS[grid[cell.dataset.i | 0] | 0] || 'transparent';
  }

  // trucks are picked, not painted, so they stay as chips beside the grid
  const trucks = active === 'wheels';
  els.pchips.classList.toggle('hidden', !trucks);
  if (trucks) {
    const labels = ['TRUCK', 'TRUCK SHADE', 'TRUCK DEEP'];
    const vals = truckColours(SAVE);
    els.pchips.innerHTML = '';
    vals.forEach((idx, i) => {
      const b = document.createElement('button');
      b.className = 'chip' + (i === chip ? ' on' : '');
      b.innerHTML = '<i style="background:' + (PRINT_COLORS[idx] || '#000') + '"></i>';
      b.appendChild(document.createTextNode(labels[i]));
      b.onclick = () => { chip = chip === i ? -1 : i; refreshPrinter(); };
      els.pchips.appendChild(b);
    });
  }

  for (const b of els.ppal.children) {
    const i = b.dataset.i | 0;
    const sel = chip >= 0 ? i === truckColours(SAVE)[chip] : i === brush;
    b.classList.toggle('on', sel);
    b.classList.toggle('dead', chip >= 0 && i === 0);
  }
}

// --- the turntable -----------------------------------------------------------
// Click the rider and they get focus; A and D then turn them all the way round.
// The preview draws the same rig the park does, so a body spin IS the rotation
// -- there is nothing to model twice.
function buildTurntable() {
  const box = els.rider && els.rider.parentElement;
  if (!box) return;
  box.tabIndex = 0;

  const setTurning = (on) => {
    turning = on;
    box.classList.toggle('turning', on);
    if (els.turnHint) {
      els.turnHint.textContent = on
        ? 'A AND D TO TURN - CLICK AWAY WHEN DONE'
        : 'CLICK TO TURN THEM ROUND';
    }
    drawPreviews();
  };

  box.onclick = () => { box.focus(); setTurning(true); };
  box.onblur = () => setTurning(false);

  box.onkeydown = (ev) => {
    if (!turning) return;
    const k = ev.key.toLowerCase();
    let step = 0;
    if (k === 'a' || k === 'arrowleft') step = -1;
    else if (k === 'd' || k === 'arrowright') step = 1;
    else if (k === 'escape') { box.blur(); return; }
    else return;
    ev.preventDefault();
    ev.stopPropagation();
    // an eighth of a turn a tap, so a full circle is eight presses and every
    // stop is a pose you can actually look at
    facing = mod2(facing + step * Math.PI / 4);
    drawPreviews();
  };

  // dragging across the preview turns them too, which is what people try first
  let drag = null;
  box.onmousedown = (ev) => { drag = ev.clientX; };
  box.onmousemove = (ev) => {
    if (drag === null) return;
    const dx = ev.clientX - drag;
    if (Math.abs(dx) < 6) return;
    drag = ev.clientX;
    facing = mod2(facing + dx * 0.06);
    if (!turning) setTurning(true); else drawPreviews();
  };
  const stop = () => { drag = null; };
  box.onmouseup = stop;
  box.onmouseleave = stop;
}

function mod2(a) { const T = Math.PI * 2; return ((a % T) + T) % T; }

export function riderFacing() { return facing; }

// --- start over ---------------------------------------------------------------
function buildReset() {
  if (!els.reset) return;
  let ready = false;
  els.reset.onclick = () => {
    if (!ready) {
      ready = true;
      els.reset.textContent = 'WIPE EVERYTHING?';
      els.reset.classList.add('hot');
      setTimeout(() => {
        ready = false;
        if (els && els.reset) {
          els.reset.textContent = 'RESET PROGRESS';
          els.reset.classList.remove('hot');
        }
      }, 3000);
      return;
    }
    ready = false;
    els.reset.textContent = 'RESET PROGRESS';
    els.reset.classList.remove('hot');
    resetSave(SAVE);
    if (onReset) onReset(SAVE);
    note('WIPED - BACK TO THE STOCK SETUP');
    refreshShop();
  };
}

// --- the previews -------------------------------------------------------------
const views = new WeakMap();

function viewForCanvas(canvas, w, h, scale) {
  let v = views.get(canvas);
  if (!v) { v = createView(canvas, { fixed: { w, h, scale } }); views.set(canvas, v); }
  return v;
}

export function drawRiderPreview(canvas, L, opts) {
  if (!canvas) return;
  const big = opts && opts.big;
  const w = big ? 104 : 74, h = big ? 90 : 76, scale = big ? 4 : 3;
  const v = viewForCanvas(canvas, w, h, scale);
  const th = THEMES.sunset;
  const floor = h - 16;

  v.ui();
  for (let i = 0; i < th.sky.length; i++) {
    const y0 = Math.round(i / th.sky.length * floor);
    const y1 = Math.round((i + 1) / th.sky.length * floor);
    v.rect(0, y0, v.W, y1 - y0 + 1, th.sky[i]);
  }
  v.rect(0, floor, v.W, v.H - floor, P.con4);
  v.rect(0, floor, v.W, 2, P.con2);
  v.rect(0, floor + 2, v.W, 1, P.con3);

  const cx = Math.round(w / 2);
  v.poly(oval(cx, floor - 1, 12, 2), P.con5);

  const fake = {
    x: cx, y: floor, ang: 0, dir: 1, state: 'ride',
    crouch: 0.18, v: 40, airTime: 0, bailSpin: 0, bailLean: 0, bailSlide: 0,
    // the turntable angle IS a body spin -- the rig already knows how to be
    // seen from any angle, so there is nothing else to build
    bodySpin: (opts && opts.spin) || 0, bodySpinV: 0,
  };
  const spin = (opts && opts.spin) || 0;
  const deck = () => drawBoard(v, cx, floor - 4.6, 0, spin, 0, 1,
    { look: L.deck, flip: Math.cos(spin) < 0 });
  drawSkater(v, fake, null, 0, deck, L);
  v.present();
}

// The UNDERSIDE of the deck, held up so you can actually see the print. In the
// park the graphic only flashes past mid-flip, which is no use at all when you
// are choosing one or painting one.
export function drawBoardFace(canvas, L) {
  if (!canvas) return;
  const v = viewForCanvas(canvas, 104, 40, 4);
  v.ui();
  v.rect(0, 0, v.W, v.H, '#201a27');
  for (let y = 0; y < v.H; y += 4) v.rect(0, y, v.W, 1, '#251e2e');
  // A quarter turn about the long axis, NEGATIVE, brings the belly square to
  // the camera. The sign matters: the underside quad's computed normal is +y,
  // not -y, so a positive quarter turn shows you the griptape instead.
  // VIEW_TILT is baked into the roll parameter, so it is cancelled out here.
  drawBoard(v, 52, 20, -Math.PI / 2 - 0.34 + 0.06, 0.05, 0, 4.0,
    { look: L.deck, deckOnly: true });
  v.present();
}

// The whole setup side on, wheels and trucks included. The underside view is
// no use at all when what you are choosing is a set of wheels.
export function drawBoardSide(canvas, L) {
  if (!canvas) return;
  const v = viewForCanvas(canvas, 104, 40, 4);
  v.ui();
  v.rect(0, 0, v.W, v.H, '#201a27');
  for (let y = 0; y < v.H; y += 4) v.rect(0, y, v.W, 1, '#251e2e');
  v.rect(0, 33, v.W, 1, '#3a3048');
  drawBoard(v, 52, 22, 0, 0, 0, 2.4, { look: L.deck });
  v.present();
}

function oval(cx, cy, rx, ry) {
  const pts = [];
  for (let i = 0; i < 14; i++) {
    const a = i / 14 * Math.PI * 2;
    pts.push([cx + Math.cos(a) * rx, cy + Math.sin(a) * ry]);
  }
  return pts;
}
