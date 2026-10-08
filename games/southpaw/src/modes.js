// The three sports, behind one interface, so the loop, the renderer, the
// online code and the menus never need to know which one is on.
//
//   make(a, b, opts)  -> fight          step(fight, dt)
//   ai(profile, rng)  -> { update }      pose(f, fight, now) or null (boxing)
//   look(look)        -> the player's look dressed for this sport

import { makeFight, step } from './fight.js';
import { makeAI } from './ai.js';
import { ROSTER } from './roster.js';
import { makeWrestle, stepWrestle, makeWrestleAI, wrestlePose, WRESTLERS } from './wrestle.js';
import { makeSumo, stepSumo, makeSumoAI, sumoPose, RIKISHI } from './sumo.js';

export const MODES = {
  box: {
    name: 'BOXING', make: makeFight, step, pose: null, roster: ROSTER,
    ai: (p, rng) => makeAI(p, rng, p ? p.lv.dodge || 0 : 0),
    look: (L) => Object.assign({}, L, { outfit: 'boxer', hands: 'gloves' }),
    hint: ['ARROWS PUNCH - HOLD SPACE TO GO LOW - SHIFT GUARD', 'SHIFT+SPACE LOW GUARD - Q SLIP - E DUCK - F STAR - WASD'],
  },
  wrestle: {
    name: 'WRESTLING', make: makeWrestle, step: stepWrestle, pose: wrestlePose, roster: WRESTLERS, arena: 'wbowl', ai: makeWrestleAI,
    look: (L) => Object.assign({}, L, { outfit: 'wrestler', hands: 'wraps', pads: L.stripe || '#ffffff' }),
    hint: ['HOLD E RUN THE ROPES - ARROWS STRIKE - SPACE GRAB / PIN', 'LOCK-UP: ARROW IN THE GREEN - SHIFT BLOCK - Q SIDESTEP'],
  },
  sumo: {
    name: 'SUMO', make: makeSumo, step: stepSumo, pose: sumoPose, roster: RIKISHI, arena: 'dohyo', ai: makeSumoAI,
    look: (L) => Object.assign({}, L, {
      outfit: 'sumo', hands: 'fists', hair: 'chonmage', beard: 'none',
      build: { w: Math.max(1.32, ((L.build && L.build.w) || 1) + 0.36), h: (L.build && L.build.h) || 1 }, belly: 0.75,
    }),
    hint: ['ARROW ON HAKKEYOI - UP THRUST - RIGHT BELT - DOWN PULL', 'BELT: UP DRIVE, LEFT THROW, DOWN LIFT - SPACE LOW STANCE'],
  },
};
export const modeOf = (fight) => MODES[fight.kind === 'wrestle' ? 'wrestle' : fight.kind === 'sumo' ? 'sumo' : 'box'];

// Online snapshots, for every sport: each fighter's live fields and the
// fight's own, minus anything big, static or local-only.
const SKIP_F = new Set(['look', 'st', 'profile', 'dmgTaken', 'quirks', 'intent', 'queue', 'chain', 'human', 'name', 'nick', 'side', 'roundDmg', 'roundKd']);
const SKIP_G = new Set(['f', 'rng', 'events', 'pendingFn']);
export function snap(fight) {
  const out = { f: fight.f.map((f) => { const o = {}; for (const k in f) if (!SKIP_F.has(k) && typeof f[k] !== 'function') o[k] = f[k]; return o; }) };
  for (const k in fight) if (!SKIP_G.has(k) && typeof fight[k] !== 'function') out[k] = fight[k];
  return out;
}
export function unsnap(fight, s) {
  s.f.forEach((o, i) => Object.assign(fight.f[i], o));
  for (const k in s) if (k !== 'f') fight[k] = s[k];
}
