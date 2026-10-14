// Planes, upgrades, money, save game. Everything persistent lives in localStorage "pd.sky-aces".
const KEY = 'pd.sky-aces';

export const PLANES = [
  { id: 'sparrow', name: 'SPARROW', kind: 'Biplane', price: 0, costMul: 1,
    desc: 'Canvas-and-wire biplane. Slow, fragile, turns on a dime.',
    speed: 92, turn: 2.15, roll: 3.4, hp: 100, barrels: 2, maxBarrels: 4, dmg: 6, rof: 11, missiles: 2, radius: 6,
    colors: { body: 0xe8433a, wing: 0xf2e2b6, trim: 0x2b3a67 } },
  { id: 'kestrel', name: 'KESTREL', kind: 'Fighter', price: 2500, costMul: 1.6,
    desc: 'All-rounder monoplane. Good speed, good guns, good turn.',
    speed: 118, turn: 1.85, roll: 3.6, hp: 135, barrels: 4, maxBarrels: 6, dmg: 7, rof: 13, missiles: 4, radius: 6.5,
    colors: { body: 0x3b8fd9, wing: 0xe8eef5, trim: 0xf5c33b } },
  { id: 'bulldog', name: 'BULLDOG', kind: 'Heavy', price: 6000, costMul: 2.3,
    desc: 'Armoured brawler with six guns. Lumbers, but shrugs off fire.',
    speed: 108, turn: 1.45, roll: 2.6, hp: 250, barrels: 6, maxBarrels: 8, dmg: 8, rof: 11, missiles: 6, radius: 7.5,
    colors: { body: 0x6b7f3a, wing: 0x8a9b55, trim: 0xd9a441 } },
  { id: 'hornet', name: 'HORNET', kind: 'Interceptor', price: 11000, costMul: 3.1,
    desc: 'Twin-boom interceptor. Fast in, fast out, heavy nose guns.',
    speed: 138, turn: 1.75, roll: 3.9, hp: 160, barrels: 4, maxBarrels: 6, dmg: 9.5, rof: 14, missiles: 4, radius: 7,
    colors: { body: 0xf5b62b, wing: 0x2f2f38, trim: 0xe8433a } },
  { id: 'comet', name: 'COMET', kind: 'Jet', price: 19000, costMul: 4.2,
    desc: 'Rocket-age jet with an open cockpit. Brutal speed, wide turns.',
    speed: 172, turn: 1.6, roll: 4.3, hp: 175, barrels: 4, maxBarrels: 6, dmg: 10, rof: 16, missiles: 8, radius: 7,
    colors: { body: 0xdfe4ea, wing: 0x9aa6b5, trim: 0x7a3fd9 } },
];
export const planeById = (id) => PLANES.find((p) => p.id === id) || PLANES[0];

export const TRACKS = [
  { id: 'dmg', name: 'Gun damage', max: 5, base: 220, desc: '+15% damage per bullet' },
  { id: 'rof', name: 'Fire rate', max: 5, base: 220, desc: '+10% rounds per second' },
  { id: 'barrels', name: 'Barrels', max: 2, base: 700, desc: '+2 guns on the wings' },
  { id: 'armor', name: 'Armour', max: 5, base: 240, desc: '+20% HP, -4% damage taken' },
  { id: 'engine', name: 'Engine', max: 5, base: 260, desc: '+6% top speed, +10% boost' },
  { id: 'turn', name: 'Turning', max: 5, base: 240, desc: '+6% pitch and roll rate' },
  { id: 'missiles', name: 'Missiles', max: 4, base: 300, desc: '+1 missile, faster lock' },
];

export function trackMax(plane, t) {
  if (t.id === 'barrels') return Math.floor((plane.maxBarrels - plane.barrels) / 2);
  return t.max;
}
export function upgradeCost(plane, t, lvl) {
  return Math.round(t.base * plane.costMul * Math.pow(lvl + 1, 1.55) / 10) * 10;
}

/** final flight + combat numbers for a plane with its upgrade levels */
export function statsFor(planeId, up = {}) {
  const p = planeById(planeId);
  const L = (k) => up[k] || 0;
  return {
    id: p.id, name: p.name, radius: p.radius * 1.5, // planes are drawn at 1.5x (models.js PLANE_SCALE)
    speed: p.speed * (1 + 0.06 * L('engine')),
    boost: 1 + 0.1 * L('engine'),
    turn: p.turn * (1 + 0.06 * L('turn')),
    roll: p.roll * (1 + 0.06 * L('turn')),
    hp: Math.round(p.hp * (1 + 0.2 * L('armor'))),
    armor: 1 - 0.04 * L('armor'),
    barrels: p.barrels + 2 * L('barrels'),
    dmg: p.dmg * (1 + 0.15 * L('dmg')),
    rof: p.rof * (1 + 0.1 * L('rof')),
    missiles: p.missiles + L('missiles'),
    lock: 0.9 / (1 + 0.12 * L('missiles')),
  };
}

const fresh = () => ({
  v: 1, money: 0, owned: ['sparrow'], sel: 'sparrow', up: {}, done: {}, bestWave: 0,
  kills: 0, name: '', settings: { ctrl: 'mouse', sens: 1, invert: false, mute: false },
});

export const save = (() => {
  let s = fresh();
  try { const raw = localStorage.getItem(KEY); if (raw) s = Object.assign(fresh(), JSON.parse(raw)); } catch (e) { /* private mode */ }
  s.settings = Object.assign(fresh().settings, s.settings || {});
  return s;
})();
export function persist() { try { localStorage.setItem(KEY, JSON.stringify(save)); } catch (e) { /* ignore */ } }
export function upOf(id) { if (!save.up[id]) save.up[id] = {}; return save.up[id]; }
export function addMoney(n) { save.money = Math.max(0, Math.round(save.money + n)); persist(); }
export function resetSave() { const f = fresh(); for (const k of Object.keys(save)) delete save[k]; Object.assign(save, f); persist(); }

// ------------------------------------------------------------------ campaign
// waves: list of groups. type: fighter | bomber | airship ; n count ; skill 0..1 ; lead (has wingmen)
export const MISSIONS = [
  { id: 'm1', name: 'First Flight', brief: 'Three rookie raiders over Gull Bay. Shoot them down.', reward: 400,
    waves: [[{ type: 'fighter', n: 3, skill: 0.1 }]] },
  { id: 'm2', name: 'Wolf Pack', brief: 'Two raider flights, back to back. The second has a leader with wingmen.', reward: 650,
    waves: [[{ type: 'fighter', n: 3, skill: 0.2 }], [{ type: 'fighter', n: 3, skill: 0.3, lead: true }]] },
  { id: 'm3', name: 'Harbour Watch', brief: 'Bombers are heading for the harbour. Stop them before they arrive.', reward: 900, defend: true,
    waves: [[{ type: 'bomber', n: 3, skill: 0.3 }, { type: 'fighter', n: 2, skill: 0.25 }]] },
  { id: 'm4', name: 'Red Baroness', brief: 'A named ace and her two wingmen want a duel. Watch your six.', reward: 1200, allies: 1,
    waves: [[{ type: 'ace', n: 1, skill: 0.85, lead: true, name: 'RED BARONESS' }, { type: 'fighter', n: 2, skill: 0.45 }]] },
  { id: 'm5', name: 'Iron Whale', brief: 'An armoured airship is drifting in. Kill the turrets, then the hull.', reward: 1800, allies: 2,
    waves: [[{ type: 'fighter', n: 2, skill: 0.35 }], [{ type: 'airship', n: 1, skill: 0.4 }, { type: 'fighter', n: 2, skill: 0.4 }]] },
  { id: 'm6', name: 'Storm Front', brief: 'Three waves of raiders, each sharper than the last.', reward: 2200, allies: 1,
    waves: [[{ type: 'fighter', n: 4, skill: 0.4 }], [{ type: 'fighter', n: 4, skill: 0.5, lead: true }], [{ type: 'ace', n: 1, skill: 0.75, name: 'GALE' }, { type: 'fighter', n: 3, skill: 0.55 }]] },
  { id: 'm7', name: 'Heavy Weather', brief: 'A big bomber stream with escorts. The harbour must not fall.', reward: 2800, defend: true, allies: 2,
    waves: [[{ type: 'bomber', n: 5, skill: 0.5 }, { type: 'fighter', n: 4, skill: 0.55, lead: true }]] },
  { id: 'm8', name: 'Twin Whales', brief: 'Two airships, one fleet. Bring a big gun.', reward: 3600, allies: 2,
    waves: [[{ type: 'airship', n: 1, skill: 0.5 }, { type: 'fighter', n: 3, skill: 0.55 }], [{ type: 'airship', n: 1, skill: 0.6 }, { type: 'fighter', n: 3, skill: 0.6, lead: true }]] },
  { id: 'm9', name: 'Ace of Aces', brief: 'The three best pilots in the sky, at once.', reward: 4500, allies: 2,
    waves: [[{ type: 'ace', n: 1, skill: 0.9, name: 'VIPER' }, { type: 'ace', n: 1, skill: 0.9, name: 'MISTRAL' }, { type: 'ace', n: 1, skill: 0.95, name: 'NIGHTJAR' }]] },
  { id: 'm10', name: 'The Leviathan', brief: 'The raider flagship: a monster airship and everything they have left.', reward: 7000, allies: 3,
    waves: [[{ type: 'fighter', n: 5, skill: 0.6, lead: true }], [{ type: 'airship', n: 1, skill: 0.8, big: true }, { type: 'ace', n: 1, skill: 0.85, name: 'LEVIATHAN ACE' }, { type: 'fighter', n: 3, skill: 0.65 }]] },
];

export function endlessWave(w) {
  const g = [{ type: 'fighter', n: Math.min(2 + Math.floor(w * 0.8), 9), skill: Math.min(0.15 + w * 0.06, 0.9), lead: w >= 3 }];
  if (w % 3 === 0) g.push({ type: 'bomber', n: 1 + Math.floor(w / 4), skill: 0.4 });
  if (w % 5 === 0) g.push({ type: w % 10 === 0 ? 'airship' : 'ace', n: 1, skill: Math.min(0.5 + w * 0.03, 0.95), name: 'WAVE ' + w + ' ACE' });
  return g;
}

export const REWARD = { fighter: 100, ace: 350, bomber: 220, airship: 1200, turret: 60, player: 250 };
