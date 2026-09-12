// Permanent progression: coin, upgrade levels, and the derived stats they
// produce. Saved to localStorage so upgrades survive a death or a reload.
//
// BALANCE NOTES (the maths behind the numbers)
// --------------------------------------------
// Target: a tier-1 mob takes 3-5 hits from a fresh hero; the hero survives
// 8-10 unblocked hits. Everything below is derived from that.
//
//   knight  16 dmg  vs skeleton 34 hp = 3 hits, zombie 58 = 4, slime 26 = 2
//           NOTE: 16 is the first step below 17 and it COSTS the two-swing
//           skeleton -- 16x2 = 32, two short of 34. Anything under 17 does,
//           so the breakpoint could not be kept and the reduction asked for
//           at the same time. Raise it back to 17 to get it back.
//   wizard   7 dmg  vs skeleton      = 5 bolts, at 15 mana each = 6 bolts
//                                       from a 100 pool regenerating only 2.4/s
//   archer   9 dmg  vs skeleton      = 4 arrows, from a 12-arrow quiver
//
// The wizard's ORB is chip damage on purpose; his burst lives in the close
// range flame (18 per tick-set, ~4 ticks a cast) which costs 40 mana and a
// 7 second reload. That is the trade: safe plinking, or step in and commit.
//
// The archer is deliberately the most constrained: it is the only class with
// real reach, so it pays for it in ammo and rate of fire rather than damage
// alone. Arrows come back only by looting bodies and picking spent ones up.

import { ARTIFACTS } from './items.js';
import { SLOTS, defaultPiece, findPiece, priceOf, isLocked } from './wardrobe.js';

const SAVE_KEY = 'qotd.save.v2';

export const BASE_STATS = {
  knight: {
    // blockCut 0.875 = incoming damage cut to exactly one eighth.
    maxHp: 120, damage: 16, speed: 0.92, blockCut: 0.875, special: 26, reach: 2.2,
    maxMana: 0, manaRegen: 0, maxArrows: 0,
  },
  wizard: {
    maxHp: 85, damage: 9, speed: 0.96, blockCut: 0.42, special: 21, reach: 12,
    // 1.0 base. The pool is meant to be a real constraint; ARCANA in the shop
    // is how you stop it being one.
    maxMana: 100, manaRegen: 1.0, maxArrows: 0,
  },
  archer: {
    maxHp: 95, damage: 9, speed: 1.0, blockCut: 0.48, special: 11, reach: 18,
    maxMana: 0, manaRegen: 0, maxArrows: 12,
  },
};

/** Mana costs, so they live next to the stats they balance against. */
export const MANA_COST = { attack: 15, special: 45 };
/** Arrows consumed per shot. */
export const ARROW_COST = { attack: 1, special: 2 };

export const UPGRADES = {
  shared: [
    {
      id: 'vitality', name: 'VITALITY', max: 5, cost: [25, 45, 80, 130, 200],
      desc: '+16 max health per level',
      apply: (s, lv) => { s.maxHp += 16 * lv; },
    },
    {
      id: 'might', name: 'MIGHT', max: 5, cost: [30, 55, 95, 150, 230],
      desc: '+12% attack damage per level',
      apply: (s, lv) => { s.damage *= 1 + 0.12 * lv; },
    },
    {
      id: 'swiftness', name: 'SWIFTNESS', max: 3, cost: [40, 90, 170],
      desc: '+6% movement speed per level',
      apply: (s, lv) => { s.speed *= 1 + 0.06 * lv; },
    },
    {
      id: 'fortune', name: 'FORTUNE', max: 3, cost: [35, 75, 140],
      desc: '+25% coin from every source',
      apply: (s, lv) => { s.coinBonus = 1 + 0.25 * lv; },
    },
    {
      id: 'shadow', name: 'SHADOW', max: 3, cost: [45, 95, 175],
      desc: 'Harder to spot while crouched',
      apply: (s, lv) => { s.stealth = 1 - 0.13 * lv; },
    },
  ],

  knight: [
    {
      id: 'bulwark', name: 'BULWARK', max: 4, cost: [40, 80, 140, 220],
      desc: 'The shield absorbs 2% more per level',
      apply: (s, lv) => { s.blockCut = Math.min(0.95, s.blockCut + 0.02 * lv); },
    },
    {
      id: 'jab', name: 'JAB', max: 4, cost: [50, 95, 165, 260],
      desc: 'Jab hits harder and reaches further',
      apply: (s, lv) => { s.special *= 1 + 0.20 * lv; s.specialReach = 1 + 0.12 * lv; },
    },
    {
      id: 'footwork', name: 'FOOTWORK', max: 3, cost: [45, 90, 160],
      desc: 'Dash further, and recover from it faster',
      apply: (s, lv) => { s.dashPower = 1 + 0.14 * lv; s.dashCooldown = 1 - 0.15 * lv; },
    },
    {
      id: 'execute', name: 'EXECUTION', max: 1, cost: [420], mastery: true,
      desc: 'MASTERY — the jab becomes a charge that FINISHES any tier-1 foe outright. Leaders and bosses take heavy damage instead.',
      apply: (s) => { s.specialMode = 'execute'; },
    },
  ],

  wizard: [
    {
      id: 'arcana', name: 'ARCANA', max: 4, cost: [40, 80, 140, 220],
      desc: 'Bolts hit harder and track better',
      apply: (s, lv) => { s.damage *= 1 + 0.16 * lv; s.homing = 1 + 0.22 * lv; },
    },
    {
      id: 'wellspring', name: 'WELLSPRING', max: 4, cost: [45, 85, 150, 240],
      desc: '+25 max mana and faster regeneration',
      apply: (s, lv) => { s.maxMana += 25 * lv; s.manaRegen += 0.9 * lv; },
    },
    {
      id: 'pyre', name: 'PYRE', max: 4, cost: [55, 100, 175, 270],
      desc: 'The flame burns hotter and lingers',
      apply: (s, lv) => { s.special *= 1 + 0.18 * lv; s.specialReach = 1 + 0.10 * lv; },
    },
    {
      id: 'firestorm', name: 'FIRESTORM', max: 1, cost: [420], mastery: true,
      desc: 'MASTERY — flame erupts from BOTH hands and the wizard spins, scorching everything around him.',
      apply: (s) => { s.specialMode = 'firestorm'; },
    },
  ],

  archer: [
    {
      id: 'fletching', name: 'FLETCHING', max: 4, cost: [40, 80, 140, 220],
      desc: 'Arrows hit harder and fly flatter',
      apply: (s, lv) => { s.damage *= 1 + 0.16 * lv; s.arrowSpeed = 1 + 0.14 * lv; },
    },
    {
      id: 'quiver', name: 'DEEP QUIVER', max: 4, cost: [40, 85, 150, 240],
      desc: '+4 arrow capacity per level',
      apply: (s, lv) => { s.maxArrows += 4 * lv; },
    },
    {
      id: 'draw', name: 'FAST DRAW', max: 3, cost: [55, 105, 190],
      desc: 'Nock the next arrow more quickly',
      apply: (s, lv) => { s.drawSpeed = 1 - 0.12 * lv; },
    },
    {
      id: 'volley', name: 'VOLLEY', max: 1, cost: [420], mastery: true,
      desc: 'MASTERY — the twin shot becomes THREE homing arrows.',
      apply: (s) => { s.specialMode = 'volley'; },
    },
  ],
};

export function upgradesFor(classId) {
  return [...UPGRADES.shared, ...(UPGRADES[classId] || [])];
}

export class Progress {
  constructor() {
    this.coin = 0;
    this.levels = {};
    this.classId = 'knight';
    this.look = null;
    this.artifacts = [];        // ids of artifacts found, permanent
    this.seenPrologue = false;
    this.level = 'forest';
    this.unlocked = 1;          // how many levels the player has reached
    this.maps = [];             // ids of levels whose map has been bought
    // The epilogue. Once the black dragon is down the kingdom reopens: every
    // level rebuilds with its people back in it and nothing hostile left.
    this.finished = false;
    this.hasKey = false;
    this.rideUnlocked = false;
    // A second run through the whole campaign, mounted. The kingdom is hostile
    // again for it -- that is the point of playing it as the dragon.
    this.dragonRun = false;
    // the wizard's book, what is in it, and which spell is under the block key
    this.hasBook = false;
    this.spells = [];
    this.boundSpell = null;
    // the mirror: which pieces have been paid for, and what each class is
    // currently wearing. Defaults are never in `owned` -- they are free.
    this.outfits = {};          // classId -> { slot: pieceId }
    this.ownedPieces = [];      // ids of pieces bought at a mirror
    this.load();
  }

  levelsFor(classId) {
    if (!this.levels[classId]) this.levels[classId] = {};
    return this.levels[classId];
  }

  levelOf(classId, upgradeId) {
    return this.levelsFor(classId)[upgradeId] || 0;
  }

  nextCost(classId, up) {
    const lv = this.levelOf(classId, up.id);
    if (lv >= up.max) return null;
    return up.cost[lv];
  }

  canAfford(classId, up) {
    const c = this.nextCost(classId, up);
    return c !== null && this.coin >= c;
  }

  buy(classId, up) {
    const c = this.nextCost(classId, up);
    if (c === null || this.coin < c) return false;
    this.coin -= c;
    this.levelsFor(classId)[up.id] = this.levelOf(classId, up.id) + 1;
    this.save();
    return true;
  }

  addCoin(n) { this.coin += n; this.save(); }

  hasArtifact(id) { return this.artifacts.includes(id); }

  /* A level map is bought once, at that level's own merchant, and is kept
     forever -- including through a death, like every other shop purchase. */
  hasMap(levelId) { return this.maps.includes(levelId); }
  buyMap(levelId, price) {
    if (this.hasMap(levelId) || this.coin < price) return false;
    this.coin -= price;
    this.maps.push(levelId);
    this.save();
    return true;
  }

  /* ---------------- the mirror ---------------- */

  /** What this class is wearing right now, slot by slot. */
  outfit(classId) {
    const worn = this.outfits[classId] || {};
    const out = {};
    for (const slot of SLOTS[classId]) {
      const piece = findPiece(classId, slot, worn[slot]);
      // A dragon piece worn on a save that has since been reset would be
      // worn without ever having been earned, so it falls back too.
      out[slot] = isLocked(piece, this) ? defaultPiece(classId, slot) : piece;
    }
    return out;
  }

  ownsPiece(classId, slot, piece) {
    if (priceOf(classId, slot, piece) === 0) return !isLocked(piece, this);
    return this.ownedPieces.includes(piece.id);
  }

  /** Buy if it needs buying, then put it on. Returns false only if broke. */
  wear(classId, slot, piece) {
    if (isLocked(piece, this)) return false;
    if (!this.ownsPiece(classId, slot, piece)) {
      const cost = priceOf(classId, slot, piece);
      if (this.coin < cost) return false;
      this.coin -= cost;
      this.ownedPieces.push(piece.id);
    }
    if (!this.outfits[classId]) this.outfits[classId] = {};
    this.outfits[classId][slot] = piece.id;
    this.save();
    return true;
  }

  /**
   * The full look handed to buildCharacter: the four title-screen colours,
   * plus each worn piece's variant name, plus its colour override kept in
   * its OWN slot. Flattening the overrides together would let a helmet repaint
   * the whole suit, which is not what buying a helmet means.
   */
  lookFor(classId, base) {
    const look = { ...(base || this.look || {}), col: {} };
    const worn = this.outfit(classId);
    for (const [slot, piece] of Object.entries(worn)) {
      look[slot] = piece.variant;
      if (piece.colours) look.col[slot] = piece.colours;
    }
    return look;
  }

  addArtifact(id) {
    if (this.hasArtifact(id)) return false;
    this.artifacts.push(id);
    this.save();
    return true;
  }

  /** Base stats with every purchased upgrade folded in. */
  stats(classId) {
    const s = {
      ...BASE_STATS[classId],
      coinBonus: 1, specialReach: 1, arrowSpeed: 1, drawSpeed: 1,
      homing: 1, stealth: 1, dashPower: 1, dashCooldown: 1,
      specialMode: 'basic',
    };
    for (const up of upgradesFor(classId)) {
      const lv = this.levelOf(classId, up.id);
      if (lv > 0) up.apply(s, lv);
    }
    // artifacts stack on top of the purchased tree
    for (const id of this.artifacts) {
      ARTIFACTS[id]?.apply(s);
    }
    s.maxHp = Math.round(s.maxHp);
    s.damage = Math.round(s.damage);
    s.special = Math.round(s.special);
    s.maxMana = Math.round(s.maxMana);
    s.maxArrows = Math.round(s.maxArrows);
    return s;
  }

  save() {
    try {
      localStorage.setItem(SAVE_KEY, JSON.stringify({
        coin: this.coin, levels: this.levels,
        classId: this.classId, look: this.look, artifacts: this.artifacts,
        seenPrologue: this.seenPrologue, level: this.level, unlocked: this.unlocked,
        maps: this.maps,
        finished: this.finished, hasKey: this.hasKey,
        rideUnlocked: this.rideUnlocked, dragonRun: this.dragonRun,
        hasBook: this.hasBook, spells: this.spells, boundSpell: this.boundSpell,
        outfits: this.outfits, ownedPieces: this.ownedPieces,
      }));
    } catch { /* private browsing or storage disabled -- play on regardless */ }
  }

  load() {
    try {
      const raw = localStorage.getItem(SAVE_KEY);
      if (!raw) return;
      const d = JSON.parse(raw);
      this.coin = d.coin || 0;
      this.levels = d.levels || {};
      this.classId = d.classId || 'knight';
      this.look = d.look || null;
      this.artifacts = d.artifacts || [];
      this.seenPrologue = !!d.seenPrologue;
      this.level = d.level || 'forest';
      this.unlocked = d.unlocked || 1;
      this.maps = d.maps || [];
      this.finished = !!d.finished;
      this.hasKey = !!d.hasKey;
      this.rideUnlocked = !!d.rideUnlocked;
      this.dragonRun = !!d.dragonRun;
      this.hasBook = !!d.hasBook;
      this.spells = d.spells || [];
      this.boundSpell = d.boundSpell || null;
      this.outfits = d.outfits || {};
      this.ownedPieces = d.ownedPieces || [];
    } catch { /* corrupt save -- start fresh */ }
  }

  reset() {
    this.coin = 0;
    this.levels = {};
    this.artifacts = [];
    this.seenPrologue = false;
    this.level = 'forest';
    this.unlocked = 1;
    this.maps = [];
    this.finished = false;
    this.hasKey = false;
    this.rideUnlocked = false;
    this.dragonRun = false;
    this.hasBook = false;
    this.spells = [];
    this.boundSpell = null;
    this.outfits = {};
    this.ownedPieces = [];
    this.save();
  }
}
