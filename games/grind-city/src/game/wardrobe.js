// What you own, what you are wearing, how much cash you have, and the design
// you have painted on your own board.
//
// The rest of the game never reads the catalogue directly -- it reads `look()`,
// which is a flat bag of colours and style flags. That way the art code has no
// idea a shop exists.

import {
  GEAR, item, slotOf, PRINT_COLS, PRINT_ROWS, PRINT_COLORS, CUSTOM_ID, gridSize,
  WHEEL_COLS, WHEEL_ROWS,
} from './shop.js';

const KEY = 'grindcity';

const DEFAULT_EQUIP = {
  body: 'body-athletic', skin: 'skin-2', eyes: 'eye-brown',
  hairstyle: 'cut-short', haircolor: 'col-brown',
  hat: 'hat-cap', face: 'face-none',
  shirt: 'tee-red', mid: 'mid-none', over: 'over-none',
  legs: 'legs-slim', socks: 'socks-none', shoes: 'shoe-stock',
  deck: 'deck-blank', grip: 'grip-black', wheels: 'wheel-bone',
  stamina: 'legs-1',
};

// The three things you paint yourself. Each keeps ONE design, and that design
// stays editable for as long as you own the item -- painting is free, and the
// board you are looking at in the shop is the board you are painting.
const CUSTOM_KINDS = ['deck', 'grip', 'wheels'];

// Every paintable thing is a GRID of colour indexes into PRINT_COLORS. Index 0
// is "leave it alone" -- bare maple on a deck, the base colour on grip and
// wheels -- which is what makes a half-finished design still look like a board.
function blankGrid(kind) {
  const g = gridSize(kind);
  return new Array(g.cols * g.rows).fill(0);
}

const GRID_KEY = { deck: 'print', grip: 'gripPrint', wheels: 'wheelPrint' };

// The trucks are not painted, they are just picked -- three colours, and a
// pixel grid on something that small would be mud.
const DEFAULT_TRUCKS = [31, 32, 33];

export function loadSave() {
  let raw = {};
  try { raw = JSON.parse(localStorage.getItem(KEY) || '{}'); } catch (e) { raw = {}; }

  const grid = (kind) => {
    const key = GRID_KEY[kind];
    const want = blankGrid(kind).length;
    return Array.isArray(raw[key]) && raw[key].length === want ? raw[key].slice() : blankGrid(kind);
  };
  const truckCols = Array.isArray(raw.truckCols) && raw.truckCols.length === 3
    ? raw.truckCols.slice() : DEFAULT_TRUCKS.slice();

  return {
    cash: Math.max(0, Math.round(raw.cash || 0)),
    earned: Math.max(0, Math.round(raw.earned || 0)),
    best: raw.best || {},
    far: raw.far || 0,
    podium: raw.podium || {},
    owned: Array.isArray(raw.owned) ? raw.owned : [],
    equip: migrate(Object.assign({}, DEFAULT_EQUIP, raw.equip || {})),
    print: grid('deck'), gripPrint: grid('grip'), wheelPrint: grid('wheels'),
    truckCols,  };
}

// Overwear used to be ONE slot. A save written before the split can have a
// hoodie sitting in the jacket slot, and left alone it would silently fall back
// to the first jacket in the list -- so the player would open the game and find
// somebody else's clothes on. Move it down a layer instead.
function migrate(e) {
  if (slotOf(e.over) === 'mid') { e.mid = e.over; e.over = 'over-none'; }
  if (slotOf(e.mid) === 'over') { e.over = e.mid; e.mid = 'mid-none'; }
  return e;
}

export function writeSave(s) {
  try { localStorage.setItem(KEY, JSON.stringify(s)); } catch (e) { /* private mode */ }
}

// Wipe everything and start over. It refills the EXISTING object rather than
// handing back a new one, because half the game is holding a reference to it.
export function resetSave(s) {
  try { localStorage.removeItem(KEY); } catch (e) { /* private mode */ }
  const fresh = loadSave();
  if (!s) return fresh;
  for (const k of Object.keys(s)) delete s[k];
  Object.assign(s, fresh);
  return s;
}

export function owns(save, kind, id) {
  const g = item(kind, id);
  return g.price === 0 || save.owned.indexOf(id) >= 0;
}

export function buy(save, kind, id) {
  const g = item(kind, id);
  if (owns(save, kind, id)) return 'owned';
  if (save.cash < g.price) return 'poor';
  save.cash -= g.price;
  save.owned.push(id);
  writeSave(save);
  return 'bought';
}

export function equip(save, kind, id) {
  if (!owns(save, kind, id)) return false;
  save.equip[kind] = id;
  writeSave(save);
  return true;
}

export function earn(save, amount) {
  const n = Math.max(0, Math.round(amount));
  save.cash += n;
  save.earned += n;
  writeSave(save);
  return n;
}

// --- the printer -------------------------------------------------------------
// There is no confirm step and nothing to lock: you own the custom item, so you
// can repaint it whenever you like.
export function hasPrinter(save, kind) {
  return owns(save, kind, CUSTOM_ID[kind]);
}

// Is the thing you are WEARING in this category the one you paint?
export function printing(save, kind) {
  return !!CUSTOM_ID[kind] && save.equip[kind] === CUSTOM_ID[kind];
}

// Paint one cell of whichever thing you are customising.
// Paint one cell, or a square of them. A forty-by-sixteen grid is a canvas
// rather than a chore only if you can lay down more than one pixel at a time.
export function paint(save, kind, index, colour, size) {
  const g = gridOf(save, kind);
  if (!g || index < 0 || index >= g.length) return false;
  const c = Math.max(0, Math.min(PRINT_COLORS.length - 1, colour | 0));
  const n = Math.max(1, Math.min(6, size | 0 || 1));
  if (n === 1) { g[index] = c; writeSave(save); return true; }

  const { cols, rows } = gridSize(kind);
  const x0 = index % cols, y0 = (index / cols) | 0;
  // the brush is centred on the cell you clicked, so it lands where you aimed
  const half = (n - 1) >> 1;
  for (let dy = 0; dy < n; dy++) {
    for (let dx = 0; dx < n; dx++) {
      const x = x0 - half + dx, y = y0 - half + dy;
      if (x < 0 || x >= cols || y < 0 || y >= rows) continue;
      g[y * cols + x] = c;
    }
  }
  writeSave(save);
  return true;
}

// THE BUCKET. Fills the run of same-coloured cells joined to the one you
// clicked -- so on a blank board one tap makes the whole thing one colour,
// which is the usual reason anyone wants a bucket, and on a painted one it
// fills only the shape you aimed at.
export function fillFrom(save, kind, index, colour) {
  const g = gridOf(save, kind);
  if (!g || index < 0 || index >= g.length) return false;
  const { cols, rows } = gridSize(kind);
  const want = g[index];
  const c = Math.max(0, Math.min(PRINT_COLORS.length - 1, colour | 0));
  if (want === c) return false;
  const stack = [index];
  while (stack.length) {
    const i = stack.pop();
    if (g[i] !== want) continue;
    g[i] = c;
    const x = i % cols, y = (i / cols) | 0;
    if (x > 0) stack.push(i - 1);
    if (x < cols - 1) stack.push(i + 1);
    if (y > 0) stack.push(i - cols);
    if (y < rows - 1) stack.push(i + cols);
  }
  writeSave(save);
  return true;
}

export function gridOf(save, kind) {
  const key = GRID_KEY[kind];
  return key ? save[key] : null;
}

export function clearPrint(save, kind) {
  const key = GRID_KEY[kind];
  if (key) save[key] = blankGrid(kind);
  if (kind === 'wheels') save.truckCols = DEFAULT_TRUCKS.slice();
  writeSave(save);
}

// The trucks, which are picked rather than painted.
export function truckColours(save) { return save.truckCols; }

export function setTruckColour(save, slot, colour) {
  if (slot < 0 || slot > 2) return false;
  save.truckCols[slot] = Math.max(1, Math.min(PRINT_COLORS.length - 1, colour | 0));
  writeSave(save);
  return true;
}

function shade(hex, k) {
  if (!hex || hex[0] !== '#' || hex.length !== 7) return hex;
  const n = parseInt(hex.slice(1), 16);
  const r = Math.round(((n >> 16) & 255) * k);
  const g = Math.round(((n >> 8) & 255) * k);
  const b = Math.round((n & 255) * k);
  return '#' + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1);
}

// What your legs are good for. The skater asks for this once a run rather than
// reading the catalogue every frame.
export function legs(save) {
  const t = item('stamina', save ? save.equip.stamina : DEFAULT_EQUIP.stamina);
  return { max: t.max, regen: t.regen, cost: t.cost, name: t.name };
}

// --- the flat render-facing description --------------------------------------
export function look(save) {
  const e = save ? save.equip : DEFAULT_EQUIP;
  const pal = PRINT_COLORS;
  const body = item('body', e.body);
  const skin = item('skin', e.skin);
  const eyes = item('eyes', e.eyes);
  const cut = item('hairstyle', e.hairstyle);
  const col = item('haircolor', e.haircolor);
  const hat = item('hat', e.hat);
  const face = item('face', e.face);
  const shirt = item('shirt', e.shirt);
  const mid = item('mid', e.mid);
  const over = item('over', e.over);
  const legs = item('legs', e.legs);
  const socks = item('socks', e.socks);
  const shoes = item('shoes', e.shoes);

  // Deck, grip and wheels fall back to the catalogue unless you are wearing the
  // custom one, in which case they come off the save.
  const deck = item('deck', e.deck);
  const custom = deck.graphic === 'custom';
  // The PLY is the BARE WOOD of the edge. It is only what shows where the
  // graphic does not reach -- the rim itself is painted column by column from
  // the design, in board3d, so there is nothing to average down here. Taking
  // the most-used colour of a print, which is what this used to do, gave a
  // checkerboard a single muddy edge.
  const ply = deck.ply || null;
  const gripItem = item('grip', e.grip);
  const wheelItem = item('wheels', e.wheels);
  const truckCols = wheelItem.custom && save
    ? save.truckCols.map((i, n) => pal[i] || wheelItem.trucks[n])
    : wheelItem.trucks;

  // a jumpsuit paints the legs as well as the body
  const suit = over.full ? over : null;

  return {
    build: body.build,
    skin: { c1: skin.c[0], c2: skin.c[1], c3: skin.c[2] },
    eyes: { c1: eyes.c[0], c2: eyes.c[1] },
    hair: { style: cut.style, c1: col.c[0], c2: col.c[1] },
    hat: { kind: hat.kind, c1: hat.c[0], c2: hat.c[1], back: !!hat.back },
    face: { kind: face.kind, c1: face.c[0], c2: face.c[1] },
    shirt: {
      c1: shirt.c[0], c2: shirt.c[1], c3: shirt.c[2],
      print: shirt.print || 'none', sleeve: !!shirt.sleeve, stripes: !!shirt.stripes,
      tank: !!shirt.tank,
    },
    mid: {
      kind: mid.kind, c1: mid.c[0], c2: mid.c[1], c3: mid.c[2],
      print: mid.print || 'none', full: false, stripes: !!mid.stripes,
    },
    over: {
      kind: over.kind, c1: over.c[0], c2: over.c[1], c3: over.c[2],
      print: over.print || 'none', full: !!over.full, stripes: !!over.stripes,
    },
    legs: suit
      ? { c1: suit.c[0], c2: suit.c[1], c3: suit.c[2], fit: 'baggy', loop: false, short: 0, sweat: false, stripe: !!suit.stripes }
      : {
        c1: legs.c[0], c2: legs.c[1], c3: legs.c[2],
        fit: legs.fit || 'slim', loop: !!legs.loop, short: legs.short || 0,
        sweat: !!legs.sweat, stripe: !!legs.stripe,
      },
    socks: { kind: socks.kind, c1: socks.c[0], c2: socks.c[1], stripe: !!socks.stripe },
    shoes: {
      c1: shoes.c[0], c2: shoes.c[1], sole: shoes.sole,
      checker: !!shoes.checker, hi: !!shoes.hi, chunky: !!shoes.chunky,
      flip: !!shoes.flip, bare: !!shoes.bare,
    },
    deck: {
      art: deck.art, ply, graphic: deck.graphic,
      grip: gripItem.grip, wheels: wheelItem.wheels, trucks: truckCols,
      // the three painted grids. Null unless you are wearing the custom item,
      // so a stock board never picks up a design you drew for another one.
      print: custom && save ? save.print : null,
      gripPrint: gripItem.custom && save ? save.gripPrint : null,
      wheelPrint: wheelItem.custom && save ? save.wheelPrint : null,
      printCols: PRINT_COLS, printRows: PRINT_ROWS,
      wheelCols: WHEEL_COLS, wheelRows: WHEEL_ROWS,
      printPalette: PRINT_COLORS,
    },
  };
}

export { GEAR, DEFAULT_EQUIP, CUSTOM_KINDS, CUSTOM_ID };
