// Consumables and treasures.
//
// Two separate carriers on purpose:
//   POTIONS live in the potion bar and are used with 1 / 2.
//   FOOD and ARTIFACTS live in the inventory bar -- food is eaten with 3,
//   artifacts are permanent once picked up.

/* ---------------- potions ---------------- */

export const POTIONS = {
  heal: { name: 'HEALING', color: '#5fbf5a', good: true, heal: 38 },
  greater: { name: 'GREATER HEAL', color: '#7fe07a', good: true, heal: 80 },
  mana: { name: 'MANA', color: '#4f7fd0', good: true, mana: 45 },
  greaterMana: { name: 'GREATER MANA', color: '#7aa8ee', good: true, mana: 95 },
  poison: { name: 'POISON', color: '#8a4fd0', good: false, damage: 26, radius: 3.2 },
  fire: { name: 'FIREBOMB', color: '#e0682c', good: false, damage: 38, radius: 3.8 },
};

export const POTION_KINDS = Object.keys(POTIONS);

/** What dipping a potion onto arrows produces. 5 arrows per potion. */
export const DIP_ARROWS = 5;
export const DIP_EFFECT = {
  poison: { name: 'POISON', color: '#8a4fd0', bonus: 14 },
  fire: { name: 'FLAME', color: '#e0682c', bonus: 20 },
  heal: { name: 'BLESSED', color: '#5fbf5a', bonus: 8 },
  greater: { name: 'BLESSED', color: '#7fe07a', bonus: 12 },
  mana: { name: 'ARCANE', color: '#4f7fd0', bonus: 10 },
  greaterMana: { name: 'ARCANE', color: '#7aa8ee', bonus: 14 },
};

/* ---------------- food ---------------- */
// Food heals over time rather than instantly, so it is a between-fight resource
// instead of a panic button. That is what keeps potions valuable.

export const FOOD = {
  bread: { name: 'BREAD', color: '#c9a15c', heal: 30, over: 6 },
  cheese: { name: 'CHEESE', color: '#e0c451', heal: 22, over: 4 },
  meat: { name: 'ROAST MEAT', color: '#a05436', heal: 55, over: 8 },
  berries: { name: 'BERRIES', color: '#a8386a', heal: 16, over: 3, mana: 20 },
  mushroom: { name: 'CAVE MUSHROOM', color: '#8a7fa0', heal: 12, over: 3, mana: 35 },
};

export const FOOD_KINDS = Object.keys(FOOD);

/* ---------------- artifacts ---------------- */
// Permanent, one-off, and hidden off the main path -- the reward for exploring
// the branches rather than running the valley straight through.

export const ARTIFACTS = {
  emberShard: {
    id: 'emberShard', name: 'EMBER SHARD', color: '#e0682c',
    desc: '+8% attack damage, forever.',
    apply: (s) => { s.damage *= 1.08; },
  },
  mossCharm: {
    id: 'mossCharm', name: 'MOSS CHARM', color: '#5d8038',
    desc: '+12 max health.',
    apply: (s) => { s.maxHp += 12; },
  },
  thiefsCoin: {
    id: 'thiefsCoin', name: "THIEF'S COIN", color: '#d4af37',
    desc: '+15% coin from every source.',
    apply: (s) => { s.coinBonus *= 1.15; },
  },
  owlFeather: {
    id: 'owlFeather', name: 'OWL FEATHER', color: '#cfc6ad',
    desc: 'Crouching hides you far better.',
    apply: (s) => { s.stealth *= 0.80; },
  },
  ironBand: {
    id: 'ironBand', name: 'IRON BAND', color: '#9aa3ad',
    desc: 'Blocking absorbs 5% more.',
    apply: (s) => { s.blockCut = Math.min(0.95, s.blockCut + 0.05); },
  },
  hollowIdol: {
    id: 'hollowIdol', name: 'HOLLOW IDOL', color: '#7a5fd0',
    desc: 'Deepens whatever you draw on: +20 mana, +2 arrows, ' +
          'or a sharper special if you spend neither.',
    // Only tops up a pool the class ALREADY has. Handing a knight a 20-point
    // mana bar it can never spend put a mana meter on the knight HUD.
    apply: (s) => {
      let deepened = false;
      if (s.maxMana > 0) { s.maxMana += 20; deepened = true; }
      if (s.maxArrows > 0) { s.maxArrows += 2; deepened = true; }
      if (!deepened) s.special += 4;
    },
  },
};

export const ARTIFACT_IDS = Object.keys(ARTIFACTS);

/* ---------------- the carriers ---------------- */

export class Inventory {
  constructor() {
    this.potions = {};
    this.food = {};
    this.artifacts = [];
    this.arrows = 0;
    this.maxArrows = 0;
    this.dipped = 0;            // arrows carrying a potion effect
    this.dipEffect = null;      // { name, color, bonus }
  }

  /* potions */
  addPotion(kind, n = 1) { this.potions[kind] = (this.potions[kind] || 0) + n; }
  countPotion(kind) { return this.potions[kind] || 0; }
  takePotion(kind) {
    if (!this.countPotion(kind)) return false;
    this.potions[kind]--;
    if (this.potions[kind] <= 0) delete this.potions[kind];
    return true;
  }

  /** Best restorative for the resource that is actually low. */
  bestGood(wantMana = false) {
    const good = POTION_KINDS.filter(k => POTIONS[k].good && this.countPotion(k) > 0);
    if (!good.length) return null;
    const manaOnes = good.filter(k => POTIONS[k].mana);
    const healOnes = good.filter(k => POTIONS[k].heal);
    const pool = wantMana && manaOnes.length ? manaOnes : (healOnes.length ? healOnes : good);
    return pool.sort((a, b) =>
      ((POTIONS[b].heal || 0) + (POTIONS[b].mana || 0)) -
      ((POTIONS[a].heal || 0) + (POTIONS[a].mana || 0)))[0];
  }

  bestBad() {
    const bad = POTION_KINDS.filter(k => !POTIONS[k].good && this.countPotion(k) > 0);
    if (!bad.length) return null;
    return bad.sort((a, b) => POTIONS[b].damage - POTIONS[a].damage)[0];
  }

  /** Anything at all that can be dipped onto arrows. */
  anyPotion() {
    const all = POTION_KINDS.filter(k => this.countPotion(k) > 0);
    if (!all.length) return null;
    // spend the offensive ones first -- they make the better arrows
    const bad = all.filter(k => !POTIONS[k].good);
    return (bad.length ? bad : all)[0];
  }

  /* arrows */
  addArrows(n) {
    const before = this.arrows;
    this.arrows = Math.min(this.maxArrows, this.arrows + n);
    return this.arrows - before;
  }
  takeArrows(n) {
    if (this.arrows < n) return false;
    this.arrows -= n;
    if (this.dipped > 0) this.dipped = Math.max(0, this.dipped - n);
    if (this.dipped === 0) this.dipEffect = null;
    return true;
  }
  get full() { return this.arrows >= this.maxArrows; }

  /* food */
  addFood(kind, n = 1) { this.food[kind] = (this.food[kind] || 0) + n; }
  countFood(kind) { return this.food[kind] || 0; }
  firstFood() {
    const k = FOOD_KINDS.filter(f => this.countFood(f) > 0);
    if (!k.length) return null;
    return k.sort((a, b) => FOOD[b].heal - FOOD[a].heal)[0];
  }
  takeFood(kind) {
    if (!this.countFood(kind)) return false;
    this.food[kind]--;
    if (this.food[kind] <= 0) delete this.food[kind];
    return true;
  }

  /* artifacts */
  addArtifact(id) {
    if (this.artifacts.includes(id)) return false;
    this.artifacts.push(id);
    return true;
  }

  totalPotions() { return Object.values(this.potions).reduce((a, b) => a + b, 0); }
  totalFood() { return Object.values(this.food).reduce((a, b) => a + b, 0); }
}
