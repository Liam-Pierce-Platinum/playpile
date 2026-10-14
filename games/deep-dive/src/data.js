// Mission list, ship-type tuning, upgrades and the save file.
export const TYPE_ORDER = ['fishing', 'ferry', 'cargo', 'cruise', 'sub', 'rig'];

export const TYPES = {
  fishing: { label: 'FISHING BOAT', startTop: 20, floor: 330, survivors: 2, tilt: 0.22, haz: k => ({ jelly: 2 + k, shark: k >= 2 ? 1 : 0, eel: 0, fire: k >= 3 ? 1 : 0, crate: 2, current: 1, collapse: 0.4 }) },
  ferry: { label: 'FERRY', startTop: 24, floor: 430, survivors: 3, tilt: 0.28, haz: k => ({ jelly: 2, shark: 1, eel: k >= 2 ? 1 : 0, fire: 1, crate: 4, current: 1, collapse: 0.6 }) },
  cargo: { label: 'CARGO SHIP', startTop: 24, floor: 470, survivors: 3, tilt: 0.3, haz: k => ({ jelly: 1, shark: 1, eel: 1 + (k >> 1), fire: k >= 2 ? 1 : 0, crate: 9 + k * 2, current: 1, collapse: 0.8 }) },
  cruise: { label: 'CRUISE LINER', startTop: 24, floor: 560, survivors: 4, tilt: 0.24, haz: k => ({ jelly: 2, shark: 1 + (k >> 1), eel: 1, fire: 2 + (k >> 1), crate: 3, current: 1, collapse: 0.9 }) },
  sub: { label: 'SUBMARINE', startTop: 380, floor: 820, survivors: 3, tilt: 0.2, haz: k => ({ jelly: 3, shark: 0, eel: 2 + (k >> 1), fire: 1, crate: 1, current: 1, collapse: 0.7 }) },
  rig: { label: 'OIL RIG', startTop: 30, floor: 720, survivors: 4, tilt: 0.42, haz: k => ({ jelly: 1, shark: 1 + (k >> 1), eel: 1, fire: 2 + (k >> 1), crate: 5 + k, current: 2, collapse: 1.2 }) },
};

const NAMES = {
  fishing: ['LUCKY GULL', 'MARY ANNE', 'NORTHERN STAR', 'SALT PETER'],
  ferry: ['ISLE RUNNER', 'ST. BRIGID', 'BAY QUEEN', 'MORNING TIDE'],
  cargo: ['IRON ORCA', 'PACIFIC HAUL', 'KESTREL BULK', 'ATLAS CROWN'],
  cruise: ['CORAL DREAM', 'SERENADE', 'GOLDEN LAGOON', 'GRAND AURORA'],
  sub: ['K-71 NARWHAL', 'DEEP PILGRIM', 'SILENT VOLE', 'ABYSS 9'],
  rig: ['HELGA PLATFORM', 'RIG BRENT-4', 'STORM BORE', 'TITAN DEEP'],
};

export const MISSIONS = [];
TYPE_ORDER.forEach((type, t) => {
  for (let k = 0; k < 4; k++) {
    const i = t * 4 + k;
    const survivors = TYPES[type].survivors + (k >= 2 ? 1 : 0);
    MISSIONS.push({
      i, type, k, name: NAMES[type][k], survivors,
      diff: Math.min(1, 0.06 + i * 0.038 + k * 0.02),
      seed: 7919 * (i + 3) + 1301,
      par: 55 + survivors * 28 + (type === 'cruise' || type === 'rig' ? 25 : 0),
    });
  }
});

export const UPGRADES = [
  { id: 'tank', name: 'BIGGER TANK', desc: 'More oxygen', vals: [100, 140, 185, 240], cost: [120, 260, 480], fmt: v => v + ' O2' },
  { id: 'fins', name: 'FASTER FINS', desc: 'Swim speed', vals: [1, 1.14, 1.28, 1.42], cost: [100, 230, 420], fmt: v => Math.round(v * 100) + '%' },
  { id: 'light', name: 'FLASHLIGHT', desc: 'Lamp range', vals: [34, 52, 72, 96], cost: [80, 200, 380], fmt: v => v + 'PX' },
  { id: 'cutter', name: 'CUTTER', desc: 'Cut debris fast', vals: [1, 1.9, 2.9, 4.2], cost: [90, 220, 400], fmt: v => 'X' + v },
  { id: 'sonar', name: 'SONAR', desc: 'Ping finds survivors', vals: [0, 1, 2, 3], cost: [150, 300, 520], fmt: v => ['NONE', 'PING', 'PING+RANGE', 'AUTO'][v] },
  { id: 'sled', name: 'RESCUE SLED', desc: 'Tow 2 people', vals: [1, 2], cost: [420], fmt: v => 'TOW ' + v },
];
export const upVal = (save, id) => { const u = UPGRADES.find(x => x.id === id); return u.vals[save.up[id] || 0]; };

const KEY = 'pd.deep-dive';
export function loadSave() {
  let s = null;
  try { s = JSON.parse(localStorage.getItem(KEY) || 'null'); } catch (e) { s = null; }
  const d = { coins: 0, up: {}, stars: {}, best: {}, unlocked: 1, mayday: 0, muted: false, plays: 0 };
  if (!s || typeof s !== 'object') return d;
  return Object.assign(d, s, { up: Object.assign({}, s.up || {}), stars: Object.assign({}, s.stars || {}) });
}
export function writeSave(s) { try { localStorage.setItem(KEY, JSON.stringify(s)); } catch (e) { /* storage blocked */ } }
