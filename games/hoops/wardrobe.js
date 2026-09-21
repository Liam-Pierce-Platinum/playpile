// =====================================================================
// HOOPS :: wardrobe.js - WHAT YOU TURN UP IN, AND WHAT IT COST
// =====================================================================
//
// Liam: "outfit customization for jerseys or for street ball T's and
// baggy jeans", then "by getting coins the player can spend it on clothes
// and shoes make it so the player can get jersey designs baggy jeans and
// stuff wit that money grind city style or spend it for more stamina".
//
// So this is three things in one small file:
//
//   THE OUTFIT      one saved kit, yours, worn in every mode - the
//                   stand-still shooter is you and so is the man you drive
//                   on either court. kit.js takes the object straight.
//   THE PURSE       coins, earned in a match (your baskets, your steals,
//                   your blocks, winning) and spent here. half.js calls
//                   addCoins(); nothing else may.
//   THE SHOP        every colour, design, hair and hat has a price. The
//                   first one or two in each row are free so nobody starts
//                   naked; the rest are bought once and then owned for
//                   ever. STAMINA is on the same shelf - five upgrades,
//                   each one a bigger tank - because Liam asked for the
//                   coins to buy either.
//
// All of it is saved under `pd.hoops.*`. THE `pd.` PREFIX IS LOAD-BEARING:
// it is the prefix every saved score and name on PLAYPILE uses.
import { DEFAULT_OUTFIT, HAIRS, HEADWEAR, SKINS, HAIR_COLS, SHOE_COLS, TEE_COLS, JEAN_COLS, DESIGNS } from './kit.js';

const KEY_FIT = 'pd.hoops.fit';
const KEY_PURSE = 'pd.hoops.purse';

const read = (k, d) => {
  try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch (e) { return d; }
};
const write = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* play on */ } };

let fit = { ...DEFAULT_OUTFIT, ...read(KEY_FIT, {}) };
let purse = { coins: 0, owned: {}, stamina: 0, ...read(KEY_PURSE, {}) };

/** the outfit you picked. kit.js takes this object as its fourth argument. */
export function playerOutfit() { return { ...fit }; }
export function coins() { return purse.coins; }
export function addCoins(n) { purse.coins = Math.max(0, purse.coins + n); write(KEY_PURSE, purse); }

/**
 * HOW BIG YOUR TANK IS. Five upgrades at forty coins a time, each worth a
 * fifth more stamina, so a fully bought player has twice the legs of a
 * fresh account - which is a lot, and is meant to be: it is the thing you
 * are saving for if you would rather press the buttons than dress up.
 */
export const STAMINA_STEPS = 5;
export const STAMINA_PRICE = 40;
export function staminaMax() { return 1 + purse.stamina * 0.2; }
export function staminaLevel() { return purse.stamina; }
export function buyStamina() {
  if (purse.stamina >= STAMINA_STEPS || purse.coins < STAMINA_PRICE) return false;
  purse.coins -= STAMINA_PRICE;
  purse.stamina++;
  write(KEY_PURSE, purse);
  return true;
}

// ---------------------------------------------------------------------
// THE SHELVES. Each row is one part of the kit: what it can be, and what
// each option costs. `free` is how many of them you start with.
// ---------------------------------------------------------------------
const ROWS = [
  { key: 'kind', label: 'KIT', values: ['jersey', 'street'], words: ['JERSEY', 'STREET'], free: 2, price: 0 },
  { key: 'design', label: 'DESIGN', values: DESIGNS, words: ['PLAIN', 'STRIPE', 'HOOPS', 'FLAME', 'CAMO'], free: 1, price: 45, only: 'jersey' },
  { key: 'shirt', label: 'SHIRT', values: TEE_COLS, free: 3, price: 20 },
  { key: 'jeans', label: 'JEANS', values: JEAN_COLS, free: 2, price: 25, only: 'street' },
  { key: 'trim', label: 'TRIM', values: ['#f4f4f6', '#15181f', '#f2c200', '#e8392e', '#2f7de0'], free: 2, price: 15, only: 'jersey' },
  { key: 'skin', label: 'SKIN', values: SKINS, free: 6, price: 0 },
  { key: 'hair', label: 'HAIR', values: HAIRS, words: ['SHORT', 'FADE', 'AFRO', 'BUN', 'BALD'], free: 2, price: 25 },
  { key: 'hairCol', label: 'COLOUR', values: HAIR_COLS, free: 3, price: 15 },
  { key: 'head', label: 'HEAD', values: HEADWEAR, words: ['NONE', 'BAND', 'CAP', 'BEANIE'], free: 2, price: 30 },
  { key: 'shoes', label: 'SHOES', values: SHOE_COLS, free: 2, price: 35 },
];

const tag = (key, v) => key + ':' + v;
export function owned(key, v) {
  const row = ROWS.find((r) => r.key === key);
  if (!row) return true;
  const i = row.values.indexOf(v);
  if (i < 0) return true;
  if (!row.price || i < row.free) return true;
  return !!purse.owned[tag(key, v)];
}
export function priceOf(key, v) {
  const row = ROWS.find((r) => r.key === key);
  if (!row || owned(key, v)) return 0;
  return row.price;
}
/** buy it if it is not yours and you can afford it; wear it either way */
export function choose(key, v) {
  if (!owned(key, v)) {
    const p = priceOf(key, v);
    if (purse.coins < p) return 'poor';
    purse.coins -= p;
    purse.owned[tag(key, v)] = 1;
    write(KEY_PURSE, purse);
    fit[key] = v;
    write(KEY_FIT, fit);
    return 'bought';
  }
  fit[key] = v;
  write(KEY_FIT, fit);
  return 'worn';
}

// ---------------------------------------------------------------------
// THE PANEL on the home screen.
//
// `_deck/home.js` hands a game a strip of the screen, asks it to draw into
// it and to say how tall it turned out; clicks come back with the same
// origin. So this is all raw 2D: rows of swatches with a price on the ones
// you have not bought, the stamina shelf, and a drawing of the man himself
// wearing what is selected - in 2D rather than a second three.js scene,
// which for a thumbnail is not worth the frame it would cost.
// ---------------------------------------------------------------------
let hot = [];
let toast = '', toastT = 0;

export const wardrobePanel = {
  h: 190,
  draw(D, x, y, w) {
    const g = D.g;
    hot = [];
    D.text('YOUR KIT', x, y + 10, 10, '#8b96a8');
    D.text('✦ ' + purse.coins, x + w - 4, y + 12, 12, '#ffd166', 'right');
    let ry = y + 20;
    const previewW = 58;
    const avail = w - previewW - 12;
    for (const row of ROWS) {
      if (row.only && row.only !== fit.kind) continue;
      D.text(row.label, x, ry + 11, 9, '#5a6577');
      const words = !!row.words;
      const bw = words ? Math.min(46, (avail - 44) / row.values.length - 4) : 15;
      row.values.forEach((v, i) => {
        const bx = x + 44 + i * (bw + 4), by = ry + 1;
        const on = fit[row.key] === v;
        const have = owned(row.key, v);
        if (words) {
          g.fillStyle = on ? '#ffb15e' : have ? 'rgba(255,177,94,.14)' : 'rgba(255,255,255,.06)';
          g.fillRect(bx, by, bw, 14);
          D.text(row.words[i], bx + 3, by + 11, 8, on ? '#2a1a10' : have ? '#ffd9a8' : '#6b7686');
        } else {
          g.globalAlpha = have ? 1 : 0.32;
          g.fillStyle = v;
          g.fillRect(bx, by, bw, 14);
          g.globalAlpha = 1;
          if (on) { g.strokeStyle = '#ffd9a8'; g.lineWidth = 2; g.strokeRect(bx - 1, by - 1, bw + 2, 16); }
          else { g.strokeStyle = 'rgba(255,255,255,.18)'; g.lineWidth = 1; g.strokeRect(bx + 0.5, by + 0.5, bw - 1, 13); }
        }
        if (!have) D.text('✦' + row.price, bx + (words ? 3 : 0), by + 22, 8, purse.coins >= row.price ? '#ffd166' : '#7a5b3a');
        hot.push({ x: bx, y: by, w: bw, h: 14, key: row.key, v });
      });
      ry += row.values.some((v) => !owned(row.key, v)) ? 24 : 17;
    }
    // ---- the stamina shelf -------------------------------------------------
    D.text('STAMINA', x, ry + 12, 9, '#5a6577');
    for (let i = 0; i < STAMINA_STEPS; i++) {
      const bx = x + 44 + i * 19, by = ry + 2;
      const have = i < purse.stamina;
      g.fillStyle = have ? '#35d07f' : 'rgba(53,208,127,.16)';
      g.fillRect(bx, by, 15, 14);
      hot.push({ x: bx, y: by, w: 15, h: 14, stamina: true });
    }
    if (purse.stamina < STAMINA_STEPS) {
      D.text('✦' + STAMINA_PRICE, x + 44 + STAMINA_STEPS * 19 + 6, ry + 13, 9,
             purse.coins >= STAMINA_PRICE ? '#ffd166' : '#7a5b3a');
    }
    ry += 24;
    if (toastT > 0) { D.text(toast, x, ry + 10, 9, '#ffd166'); toastT -= 1 / 60; }
    drawMan(D, x + w - previewW + 6, y + 30, fit);
    return Math.max(150, ry - y + 8);
  },
  click(D) {
    for (const h of hot) {
      if (D.mouse.x < h.x || D.mouse.x > h.x + h.w || D.mouse.y < h.y || D.mouse.y > h.y + h.h) continue;
      if (h.stamina) {
        if (buyStamina()) { toast = 'BIGGER TANK'; toastT = 1.6; D.beep(700, 0.08, 'triangle', 0.06, 200); }
        else { toast = purse.stamina >= STAMINA_STEPS ? 'ALL BOUGHT' : 'NOT ENOUGH COINS'; toastT = 1.6; D.noise(0.1, 0.05, 400); }
        return;
      }
      const r = choose(h.key, h.v);
      if (r === 'poor') { toast = 'NOT ENOUGH COINS'; toastT = 1.6; D.noise(0.1, 0.05, 400); }
      else if (r === 'bought') { toast = 'BOUGHT'; toastT = 1.2; D.beep(700, 0.08, 'triangle', 0.06, 200); }
      else D.beep(620, 0.06, 'triangle', 0.05, 160);
      return;
    }
  },
};

/** the man himself, in 2D, wearing what is selected */
function drawMan(D, x, y, o) {
  const g = D.g, S = 3.0;
  const street = o.kind === 'street';
  const px = (a, b, c, d, fill) => { g.fillStyle = fill; g.fillRect(x + a * S, y + b * S, c * S, d * S); };
  const round = (cx, cy, rx, ry, fill) => {
    g.fillStyle = fill; g.beginPath(); g.ellipse(x + cx * S, y + cy * S, rx * S, ry * S, 0, 0, 7); g.fill();
  };
  for (const s of [-1, 1]) {
    px(s * 3.4 - 2.1, 18, 4.2 * (street ? 1.25 : 1), 10, street ? o.jeans : shadeHex(o.shirt, -26));
    px(s * 3.4 - 2.6, 27.5, 5.2, 3.4, o.shoes);
  }
  round(0, 13.5, 6.2, 5.2, o.shirt);
  if (street) round(0, 17.5, 6.4, 2.6, o.shirt);
  else {
    px(-4.4, 8.5, 1.6, 4.6, o.trim); px(2.8, 8.5, 1.6, 4.6, o.trim); px(-6.2, 17.2, 12.4, 1.6, o.trim);
    // a hint of the design, so a paid-for jersey looks different here too
    if (o.design === 'stripe') { px(-1.0, 8.5, 2.0, 9, o.trim); }
    else if (o.design === 'hoops') { px(-6.2, 11.5, 12.4, 1.4, o.trim); px(-6.2, 15, 12.4, 1.4, o.trim); }
    else if (o.design === 'flame') { px(-6.2, 15.5, 12.4, 2.4, shadeHex(o.trim, -10)); }
    else if (o.design === 'camo') { px(-4, 10, 3, 3, shadeHex(o.shirt, -30)); px(1, 13, 3.4, 3.4, shadeHex(o.shirt, 26)); }
  }
  for (const s of [-1, 1]) round(s * 7.0, 14, 1.9, 4.4, street ? o.shirt : o.skin);
  for (const s of [-1, 1]) round(s * 7.4, 19.5, 1.9, 1.9, o.skin);
  round(0, 3.2, 6.6, 6.4, o.skin);
  if (o.hair === 'afro') round(0, 1.4, 7.6, 6.2, o.hairCol);
  else if (o.hair !== 'bald') { round(0, 0.4, 6.6, 4.6, o.hairCol); if (o.hair === 'bun') round(0, -3.6, 2.2, 2.2, o.hairCol); }
  if (o.head === 'headband') px(-6.4, -0.6, 12.8, 2.0, o.headCol);
  else if (o.head === 'beanie') { round(0, 0.2, 6.8, 4.6, o.headCol); px(-6.6, 2.0, 13.2, 1.8, o.headCol); }
  else if (o.head === 'cap') { round(0, 0.4, 6.6, 4.4, o.headCol); px(0.5, 2.0, 7.0, 1.6, o.headCol); }
  round(-2.2, 4.2, 0.9, 1.2, '#15181f');
  round(2.2, 4.2, 0.9, 1.2, '#15181f');
}

function shadeHex(hex, d) {
  const n = parseInt(String(hex).replace('#', ''), 16);
  const c = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => Math.max(0, Math.min(255, v + d)));
  return 'rgb(' + c.join(',') + ')';
}
