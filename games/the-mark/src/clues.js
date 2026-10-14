// Appearance generation + the clue solver. The mark is random every play; the solver picks
// clues that are true for the mark and shrink the suspect list, then nudges lookalikes so
// that all clues together single out exactly one person.
import { TOP_COLORS, BOTTOM_COLORS, BOTTOM_W, HAT_COLORS, HAIR, SKIN } from './util.js';

const HATS = { none: 52, cap: 16, fedora: 10, beanie: 12, sunhat: 10 };
const BAGS = { none: 40, backpack: 25, shoulder: 22, briefcase: 13 };
const ITEMS = { none: 45, phone: 30, coffee: 15, newspaper: 10 };
const HAT_NAME = { cap: 'a baseball cap', fedora: 'a fedora', beanie: 'a beanie', sunhat: 'a sun hat' };
const BAG_NAME = { backpack: 'a backpack', shoulder: 'a shoulder bag', briefcase: 'a briefcase', none: 'no bag' };
export const BEHAVE_TEXT = {
  watch: 'Nervous habit: keeps checking their wristwatch',
  cams: 'Keeps glancing up at the security cameras',
  police: 'Steers well clear of the police officers',
  pace: 'Pacing back and forth in one small spot',
  eyes: 'Avoids eye contact: turns away and hides their face when someone walks past',
};
const BEHAVES = Object.keys(BEHAVE_TEXT);

export function makeLook(r, venue) {
  const hat = r.weighted(venue === 'party' ? { none: 75, fedora: 12, cap: 6, beanie: 2, sunhat: 5 } : HATS);
  const bag = r.weighted(venue === 'party' ? { none: 70, shoulder: 25, briefcase: 3, backpack: 2 } : venue === 'station' ? { none: 25, backpack: 30, shoulder: 20, briefcase: 25 } : BAGS);
  let handItem = r.weighted(venue === 'party' ? { none: 30, phone: 25, coffee: 45 } : ITEMS);
  if (bag === 'briefcase') handItem = 'none';
  const skirt = r.chance(0.18);
  return {
    top: r.pick(TOP_COLORS),
    bottom: skirt ? r.pick(['black', 'blue', 'red', 'green', 'beige', 'white', 'grey', 'purple']) : r.weighted(BOTTOM_W),
    bottomType: skirt ? 'skirt' : 'pants',
    hat, hatColor: r.pick(HAT_COLORS),
    hair: r.weighted({ black: 30, brown: 34, blonde: 16, grey: 12, ginger: 8 }),
    glasses: r.chance(0.22),
    bag, bagColor: r.pick(['black', 'brown', 'red', 'blue', 'grey', 'green', 'beige', 'orange']),
    handItem, hand: r.chance(0.17) ? 'L' : 'R',
    watch: r.chance(0.35),
    skin: SKIN[Math.floor(r() * SKIN.length)],
    h: Math.round(r.range(1.58, 1.94) * 100) / 100,
    wx: r.range(0.9, 1.25),
    parcel: false,
  };
}

const holds = (p) => p.look.handItem !== 'none' || p.look.bag === 'briefcase';
const holdsItem = (p) => p.look.handItem !== 'none';
const bottomWord = (l) => (l.bottomType === 'skirt' ? 'skirt' : 'trousers');

// Every appearance clue that is true for this person.
export function lookClues(m, opts = {}) {
  const l = m.look, out = [];
  const add = (key, text, test, color) => out.push({ key, kind: 'look', text, test, color });
  add('top', `Wearing a ${l.top} top`, (p) => p.look.top === l.top, l.top);
  add('bottom', `${cap(l.bottom)} ${bottomWord(l)}`, (p) => p.look.bottom === l.bottom && p.look.bottomType === l.bottomType, l.bottom);
  if (l.hat === 'none') add('hat', 'Not wearing a hat', (p) => p.look.hat === 'none');
  else {
    add('hat', `Wearing ${HAT_NAME[l.hat]}`, (p) => p.look.hat === l.hat);
    add('hatColor', `Has a ${l.hatColor} hat`, (p) => p.look.hat !== 'none' && p.look.hatColor === l.hatColor);
  }
  add('glasses', l.glasses ? 'Wears sunglasses' : 'No sunglasses', (p) => p.look.glasses === l.glasses);
  if (!opts.noBag) add('bag', l.bag === 'none' ? 'Not carrying a bag' : `Carrying ${BAG_NAME[l.bag]}`, (p) => p.look.bag === l.bag);
  if (l.hat === 'none') add('hair', `${cap(l.hair)} hair`, (p) => p.look.hat === 'none' && p.look.hair === l.hair);
  if (l.h >= 1.84) add('height', 'Tall - a head above most of the crowd', (p) => p.look.h >= 1.82);
  if (l.h <= 1.64) add('height', 'Short - smaller than most of the crowd', (p) => p.look.h <= 1.66);
  const H = opts.noBag ? holdsItem : holds;
  if (H(m) && l.hand === 'L' && !opts.noHand && !m.look.parcel) add('hand', 'Left-handed: holds things in the LEFT hand', (p) => H(p) && p.look.hand === 'L');
  if (H(m) && l.hand === 'R' && !opts.noHand && !m.look.parcel) add('hand', 'Holds things in the right hand', (p) => H(p) && p.look.hand === 'R');
  // "something X but not a hat"
  const useBag = !opts.noBag;
  const worn = new Set([l.top, l.bottom, useBag && l.bag !== 'none' ? l.bagColor : null].filter(Boolean));
  for (const c of worn) {
    if (l.hat !== 'none' && l.hatColor === c) continue;
    if (c === l.top && c === l.bottom) continue;
    add('something', useBag && l.bag !== 'none' && c === l.bagColor && c !== l.top && c !== l.bottom ? `Something ${c} on them (clothes or bag) - not on their head` : `Wears something ${c} - but not on their head`, (p) => (p.look.top === c || p.look.bottom === c || (useBag && p.look.bag !== 'none' && p.look.bagColor === c)) && !(p.look.hat !== 'none' && p.look.hatColor === c), c);
  }
  return out;
}

export function behaveClues(m) {
  return BEHAVES.filter((b) => m.behave[b]).map((b) => ({ key: 'b_' + b, kind: 'behave', text: BEHAVE_TEXT[b], test: (p) => !!p.behave[b] }));
}

function cap(s) { return s[0].toUpperCase() + s.slice(1); }

// Change one attribute of a decoy so it no longer passes `clue`.
function breakClue(r, q, clue, mark) {
  const l = q.look;
  for (let tries = 0; tries < 20 && clue.test(q); tries++) {
    switch (clue.key) {
      case 'top': l.top = r.pick(TOP_COLORS); break;
      case 'bottom': l.bottom = r.pick(BOTTOM_COLORS); break;
      case 'hat': l.hat = l.hat === 'none' ? r.pick(['cap', 'beanie', 'fedora']) : 'none'; break;
      case 'hatColor': l.hatColor = r.pick(HAT_COLORS); break;
      case 'glasses': l.glasses = !l.glasses; break;
      case 'bag': case 'swap': l.bag = r.pick(['none', 'backpack', 'shoulder', 'briefcase']); if (l.bag === 'briefcase') l.handItem = 'none'; break;
      case 'hair': l.hair = r.pick(Object.keys(HAIR)); break;
      case 'height': l.h = mark.look.h > 1.75 ? r.range(1.6, 1.74) : r.range(1.74, 1.9); break;
      case 'hand': if (r.chance(0.5)) { l.handItem = 'none'; if (l.bag === 'briefcase') l.bag = 'none'; } else l.hand = l.hand === 'L' ? 'R' : 'L'; break;
      case 'something': l.top = r.pick(TOP_COLORS); l.bottom = r.pick(['black', 'blue', 'grey', 'beige']); l.bagColor = r.pick(['black', 'brown', 'grey']); break;
      default: if (clue.kind === 'behave') { q.behave[clue.key.slice(2)] = false; } break;
    }
  }
}

const clash = (a, b) => a.key === b.key || (a.key === 'hat' && b.key === 'hatColor') || (b.key === 'hat' && a.key === 'hatColor') || (a.color && a.color === b.color);
// people: full crowd array (civilians have .civ = true). Returns { briefing, timeline }.
export function planLevel(r, people, mark, L) {
  const civ = people.filter((p) => p.civ);
  const hasSwap = L.events.includes('swap');
  const hasParcel = L.events.includes('parcel');

  // --- lookalikes: copy chunks of the mark's outfit onto others
  const others = r.shuffle(civ.filter((p) => p !== mark));
  const parts = ['top', 'hat', 'bag', 'glasses', 'bottom', 'hand'];
  const lookalikes = others.slice(0, L.look);
  for (const q of lookalikes) {
    for (const part of r.shuffle(parts.slice()).slice(0, r.int(2, 4))) {
      if (part === 'top') q.look.top = mark.look.top;
      if (part === 'hat') { q.look.hat = mark.look.hat; q.look.hatColor = mark.look.hatColor; }
      if (part === 'bag') { q.look.bag = mark.look.bag; q.look.bagColor = mark.look.bagColor; if (q.look.bag === 'briefcase') q.look.handItem = 'none'; }
      if (part === 'glasses') q.look.glasses = mark.look.glasses;
      if (part === 'bottom') { q.look.bottom = mark.look.bottom; q.look.bottomType = mark.look.bottomType; }
      if (part === 'hand') { q.look.hand = mark.look.hand; if (q.look.handItem === 'none' && q.look.bag !== 'briefcase') q.look.handItem = 'phone'; }
    }
  }

  // --- behaviours: the mark has 2-3 habits, some innocents share one
  const nb = L.behave >= 0.5 ? 3 : 2;
  for (const b of r.shuffle(BEHAVES.slice()).slice(0, nb)) mark.behave[b] = true;
  if (mark.behave.watch) mark.look.watch = true;
  for (const b of BEHAVES) {
    if (!mark.behave[b]) continue;
    const n = 1 + Math.round(L.behave * 3);
    const src = r.shuffle([...lookalikes.slice(0, Math.ceil(lookalikes.length / 2)), ...others.slice(L.look, L.look + 20)]);
    let given = 0;
    for (const q of src) {
      if (given >= n) break;
      if (b === 'pace' && q.behave.pace) continue;
      if (Object.values(q.behave).filter(Boolean).length >= 1) continue;
      q.behave[b] = true; if (b === 'watch') q.look.watch = true; given++;
    }
  }
  for (const q of others) if (r.chance(0.05) && !Object.values(q.behave).some(Boolean)) { const b = r.pick(['watch', 'cams']); q.behave[b] = true; if (b === 'watch') q.look.watch = true; }

  // --- events that need set-up
  let contact = null, swapClue = null;
  if (hasSwap) {
    // swaps only trade a backpack for a shoulder bag so hands (and hand clues) are untouched
    if (mark.look.bag !== 'backpack' && mark.look.bag !== 'shoulder') mark.look.bag = r.pick(['backpack', 'shoulder']);
    const want = mark.look.bag === 'backpack' ? 'shoulder' : 'backpack';
    contact = others.find((q) => q.look.bag === want && !lookalikes.includes(q) && !q.look.parcel) || others.find((q) => !lookalikes.includes(q) && !q.look.parcel && q.look.bag !== 'briefcase') || others[others.length - 1];
    if (contact.look.bag === 'briefcase' && contact.look.hand) { /* frees the hand */ }
    contact.look.bag = want;
    contact.contact = true;
    const newBag = contact.look.bag, oldBag = mark.look.bag;
    swapClue = { key: 'swap', kind: 'look', after: true, text: `Bag swap seen: the mark is NOW carrying ${BAG_NAME[newBag]}`, test: (p) => (p === mark ? newBag : p === contact ? oldBag : p.look.bag) === newBag };
  }
  if (hasParcel) {
    mark.look.parcel = true; mark.look.handItem = 'none'; if (mark.look.bag === 'briefcase') mark.look.bag = 'shoulder';
    for (const q of others.slice(-4)) { q.look.parcel = true; q.look.handItem = 'none'; if (q.look.bag === 'briefcase') q.look.bag = 'none'; }
  }

  // --- choose the briefing (2 appearance clues, aim for ~target0 suspects)
  const looks = lookClues(mark, { noBag: hasSwap, noHand: hasParcel });
  const count = (list) => civ.filter((p) => list.every((c) => c.test(p))).length;
  let best = null, bestScore = 1e9;
  for (let i = 0; i < 80; i++) {
    const a = r.pick(looks), b = r.pick(looks);
    if (clash(a, b)) continue;
    const n = count([a, b]);
    const score = Math.abs(n - L.target0) + (n < 3 ? 20 : 0);
    if (score < bestScore) { bestScore = score; best = [a, b]; }
  }
  if (!best) best = looks.slice(0, 2);
  const used = [...best];

  // --- timed intel: each one shrinks the list; the final set must be unique
  let pool = [...looks.filter((c) => !used.some((u) => clash(u, c))), ...behaveClues(mark)];
  const intel = [];
  for (let k = 0; k < L.intel; k++) {
    const remaining = L.intel - k;
    const cur = count(used);
    const want = Math.max(1, Math.round(Math.pow(cur, (remaining - 1) / remaining)));
    const forceSwap = swapClue && k === Math.min(1, L.intel - 1);
    let pickC = null;
    if (forceSwap) pickC = swapClue;
    else {
      let bs = 1e9;
      for (const c of pool) {
        const n = count([...used, c]);
        if (n >= cur && cur > 1) continue;
        const behaveBias = c.kind === 'behave' ? -L.behave * 3 : 0;
        const s = Math.abs(n - want) + behaveBias + r() * 0.8;
        if (s < bs) { bs = s; pickC = c; }
      }
    }
    if (!pickC) break;
    used.push(pickC); intel.push(pickC);
    pool = pool.filter((c) => c !== pickC && !clash(c, pickC));
  }

  // --- guarantee uniqueness by nudging the remaining lookalikes on the last clue
  const last = used[used.length - 1];
  for (let pass = 0; pass < 8; pass++) {
    const dupes = civ.filter((p) => p !== mark && used.every((c) => c.test(p)));
    if (!dupes.length) break;
    for (const q of dupes) breakClue(r, q, pass === 0 ? last : r.pick(used), mark);
  }

  // --- timeline
  const timeline = [];
  timeline.push({ t: 2, radio: 'Overwatch, Control. The mark is somewhere in that crowd. Three rounds. Make them count.' });
  const t0 = 22, span = L.time * 0.62;
  intel.forEach((c, i) => {
    const t = Math.round(intel.length > 1 ? t0 + (span * i) / (intel.length - 1) : t0 + 20);
    timeline.push({ t, clue: c });
    if (c === swapClue) timeline.push({ t: Math.max(8, t - 9), event: 'swap' });
  });
  if (L.events.includes('siren')) timeline.push({ t: Math.round(L.time * r.range(0.38, 0.62)), event: 'siren' });
  if (hasParcel) timeline.push({ t: Math.round(L.time * r.range(0.22, 0.4)), event: 'parcel' });
  timeline.push({ t: L.time - 30, radio: 'Control: thirty seconds. The mark is getting ready to leave.' });
  timeline.sort((a, b) => a.t - b.t);
  return { briefing: best, timeline, contact, used };
}
