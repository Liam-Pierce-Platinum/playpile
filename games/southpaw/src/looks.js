// The locker room: every choice the player can make about how their boxer
// looks. A look is the same object the rig draws NPCs from (see roster.js),
// so a custom boxer is drawn by exactly the same code as everyone else.
//
// Colours are picked as ONE base colour; the shading ramp is derived from it,
// so any swatch here is guaranteed to shade properly.

import { shade } from './palette.js';
import { PLAYER_LOOK } from './roster.js';

export const HAIRS = ['messy', 'short', 'buzz', 'bald', 'spiky', 'flattop', 'fade', 'slick', 'braids', 'topknot'];
export const BEARDS = ['none', 'short', 'stache', 'goatee', 'full'];
export const HAIR_COLS = ['#5a3a26', '#2a1a10', '#120c0a', '#8a4a22', '#c9a050', '#e8d8a8', '#8a2a1a', '#9a9aa4', '#e8463c', '#3d8bff', '#9ce85b', '#c45cff'];
export const KIT_COLS = ['#ff5b4d', '#ff8a3d', '#ffd84a', '#9ce85b', '#2fbf5a', '#5fd4a8', '#4f8fe8', '#3a4ad8', '#b05cff', '#ff3d7f', '#f2f2f2', '#4a4a55', '#2a2a33', '#8a5a3a'];
export const TRIM_COLS = ['#ffe9c0', '#ffffff', '#ffd36b', '#1a1a22', '#e8463c', '#3d8bff', '#9ce85b', '#ff3d7f'];
export const SHOE_COLS = ['#f6f2e6', '#1a1a22', '#e8463c', '#3d8bff', '#ffd84a', '#9ce85b', '#b05cff', '#8a5a3a'];
export const BUILDS = [
  { name: 'LEAN', w: 0.88, h: 1.02 }, { name: 'STANDARD', w: 1.0, h: 1.0 }, { name: 'TALL', w: 0.96, h: 1.08 },
  { name: 'STOCKY', w: 1.14, h: 0.96 }, { name: 'HEAVY', w: 1.24, h: 1.04 },
];

// What the locker room shows, in order. `get`/`set` read and write the look.
export const CHOICES = [
  { id: 'build', name: 'BUILD', kind: 'text', list: BUILDS.map((b) => b.name),
    get: (L) => Math.max(0, BUILDS.findIndex((b) => Math.abs(b.w - L.build.w) < 0.01 && Math.abs(b.h - L.build.h) < 0.01)),
    set: (L, i) => { L.build = { w: BUILDS[i].w, h: BUILDS[i].h }; } },
  { id: 'skin', name: 'SKIN', kind: 'skin', list: [0, 1, 2, 3, 4, 5], get: (L) => L.skin, set: (L, i) => { L.skin = i; } },
  { id: 'hair', name: 'HAIR', kind: 'text', list: HAIRS.map((h) => h.toUpperCase()), get: (L) => Math.max(0, HAIRS.indexOf(L.hair)), set: (L, i) => { L.hair = HAIRS[i]; } },
  { id: 'hairC', name: 'HAIR COLOUR', kind: 'colour', list: HAIR_COLS, get: (L) => HAIR_COLS.indexOf(L.hairC), set: (L, i) => { L.hairC = HAIR_COLS[i]; L.beardC = HAIR_COLS[i]; } },
  { id: 'beard', name: 'FACIAL HAIR', kind: 'text', list: BEARDS.map((b) => b.toUpperCase()), get: (L) => Math.max(0, BEARDS.indexOf(L.beard)), set: (L, i) => { L.beard = BEARDS[i]; } },
  { id: 'trunks', name: 'TRUNKS', kind: 'colour', list: KIT_COLS, get: (L) => KIT_COLS.indexOf(L.trunks[0]), set: (L, i) => { L.trunks = ramp3(KIT_COLS[i]); } },
  { id: 'stripe', name: 'TRIM', kind: 'colour', list: TRIM_COLS, get: (L) => TRIM_COLS.indexOf(L.stripe), set: (L, i) => { L.stripe = TRIM_COLS[i]; } },
  { id: 'gloves', name: 'GLOVES', kind: 'colour', list: KIT_COLS, get: (L) => KIT_COLS.indexOf(L.gloves[0]), set: (L, i) => { L.gloves = [KIT_COLS[i], shade(KIT_COLS[i], 0.35)]; } },
  { id: 'shoes', name: 'BOOTS', kind: 'colour', list: SHOE_COLS, get: (L) => SHOE_COLS.indexOf(L.shoes), set: (L, i) => { L.shoes = SHOE_COLS[i]; } },
];

export const ramp3 = (c) => [c, shade(c, 0.22), shade(c, 0.5)];

export function defaultLook() { return JSON.parse(JSON.stringify(PLAYER_LOOK)); }

export function randomLook() {
  const L = defaultLook();
  const r = (n) => Math.floor(Math.random() * n);
  for (const c of CHOICES) c.set(L, r(c.list.length));
  if (Math.random() < 0.6) L.beard = 'none';
  return L;
}

// Anything that arrives from a save or over the network gets checked against
// the lists above; unknown values fall back to the default.
export function cleanLook(x) {
  const L = defaultLook();
  if (!x || typeof x !== 'object') return L;
  const hex = (c) => typeof c === 'string' && /^#[0-9a-fA-F]{6}$/.test(c);
  if (Number.isInteger(x.skin) && x.skin >= 0 && x.skin <= 5) L.skin = x.skin;
  if (HAIRS.includes(x.hair)) L.hair = x.hair;
  if (BEARDS.includes(x.beard)) L.beard = x.beard;
  if (hex(x.hairC)) { L.hairC = x.hairC; L.beardC = x.hairC; }
  if (Array.isArray(x.trunks) && hex(x.trunks[0])) L.trunks = ramp3(x.trunks[0]);
  if (hex(x.stripe)) L.stripe = x.stripe;
  if (Array.isArray(x.gloves) && hex(x.gloves[0])) L.gloves = [x.gloves[0], shade(x.gloves[0], 0.35)];
  if (hex(x.shoes)) L.shoes = x.shoes;
  if (x.build && BUILDS.some((b) => Math.abs(b.w - x.build.w) < 0.01 && Math.abs(b.h - x.build.h) < 0.01)) L.build = { w: x.build.w, h: x.build.h };
  return L;
}
