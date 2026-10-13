// Weapon + attachment definitions. All stats live here so the armory, the player and
// the AI read the same numbers. Models are lists of boxes in gun space (-z forward).

// part: [x, y, z, sx, sy, sz, colourKey, rotX]
const M = '#2a2c30', M2 = '#3a3d42', BLK = '#18191b';
export const WEAPONS = {
  pistol: {
    id: 'pistol', name: 'M9 SIDEARM', short: 'PISTOL', slot: 'secondary', price: 0, cls: 'Pistol',
    dmg: [28, 17], range: [12, 40], rpm: 420, mode: 'semi', mag: 12, reserve: 72, reload: 1.35,
    spread: { hip: 2.0, ads: 0.55, move: 1.6, bloom: 0.55, max: 4.5, rec: 9 }, recoil: { v: 1.7, h: 0.55, kick: 0.05 },
    zoom: 1.25, ads: 0.14, speed: 1.0, headMul: 2.0, snd: 'pistol', tracer: '#ffd27a', supp: 0.12, aiRange: 18,
    tint: '#4a4d52', allow: ['grip', 'extmag', 'suppressor'],
    model: [[0, 0.03, -0.06, 0.04, 0.05, 0.2, 'body'], [0, 0.0, -0.05, 0.035, 0.03, 0.17, M], [0, -0.06, 0.02, 0.035, 0.11, 0.05, BLK, -0.25], [0, 0.065, 0.02, 0.012, 0.015, 0.01, M], [0, 0.065, -0.15, 0.008, 0.015, 0.008, M]],
    sightY: 0.073, muzzle: [0, 0.03, -0.17], magPart: [0, -0.07, 0.03, 0.03, 0.1, 0.04], gripAt: [0, -0.02, -0.11], scopeAt: [0.065, -0.04], hold: 'pistol',
  },
  smg: {
    id: 'smg', name: 'VX-9 HORNET', short: 'SMG', slot: 'primary', price: 500, cls: 'SMG',
    dmg: [23, 13], range: [10, 32], rpm: 880, mode: 'auto', mag: 32, reserve: 192, reload: 1.85,
    spread: { hip: 2.6, ads: 1.0, move: 1.0, bloom: 0.22, max: 5, rec: 8 }, recoil: { v: 0.62, h: 0.55, kick: 0.025 },
    zoom: 1.3, ads: 0.17, speed: 1.06, headMul: 1.6, snd: 'smg', tracer: '#ffe08a', supp: 0.1, aiRange: 16,
    tint: '#3f4a3a', allow: ['scope', 'grip', 'extmag', 'suppressor'],
    model: [[0, 0.03, -0.08, 0.06, 0.09, 0.32, 'body'], [0, 0.04, -0.29, 0.03, 0.03, 0.12, M], [0, -0.08, 0.0, 0.04, 0.11, 0.05, BLK, -0.2], [0, -0.1, -0.13, 0.04, 0.17, 0.05, M2, 0.05], [0, 0.02, 0.16, 0.04, 0.06, 0.18, M], [0, 0.09, -0.05, 0.02, 0.02, 0.2, M], [0, 0.105, 0.03, 0.025, 0.025, 0.015, M], [0, 0.1, -0.17, 0.008, 0.04, 0.008, M]],
    sightY: 0.115, muzzle: [0, 0.04, -0.36], magPart: [0, -0.1, -0.13, 0.04, 0.17, 0.05], gripAt: [0, -0.04, -0.2], scopeAt: [0.105, -0.06], hold: 'rifle',
  },
  ar: {
    id: 'ar', name: 'AR-7 KESTREL', short: 'RIFLE', slot: 'primary', price: 0, cls: 'Assault Rifle',
    dmg: [30, 21], range: [24, 60], rpm: 640, mode: 'auto', mag: 30, reserve: 180, reload: 2.1,
    spread: { hip: 3.0, ads: 0.32, move: 1.4, bloom: 0.28, max: 5, rec: 7 }, recoil: { v: 1.05, h: 0.45, kick: 0.032 },
    zoom: 1.5, ads: 0.22, speed: 1.0, headMul: 1.8, snd: 'ar', tracer: '#ffd27a', supp: 0.16, aiRange: 30,
    tint: '#4a4d42', allow: ['scope', 'grip', 'extmag', 'suppressor'],
    model: [[0, 0.025, -0.06, 0.065, 0.1, 0.4, 'body'], [0, 0.04, -0.44, 0.03, 0.03, 0.3, M], [0, 0.035, -0.33, 0.07, 0.075, 0.22, M2], [0, 0.0, 0.25, 0.055, 0.11, 0.24, 'body'], [0, -0.09, 0.05, 0.04, 0.12, 0.055, BLK, -0.3], [0, -0.11, -0.1, 0.045, 0.17, 0.075, M, 0.18], [0, 0.088, -0.08, 0.026, 0.02, 0.3, M], [0, 0.108, 0.04, 0.028, 0.03, 0.02, M], [0, 0.098, -0.42, 0.01, 0.05, 0.01, M]],
    sightY: 0.118, muzzle: [0, 0.04, -0.6], magPart: [0, -0.11, -0.1, 0.045, 0.17, 0.075], gripAt: [0, -0.01, -0.33], scopeAt: [0.1, -0.08], hold: 'rifle',
  },
  burst: {
    id: 'burst', name: 'BR-3 TALON', short: 'BURST', slot: 'primary', price: 1100, cls: 'Burst Rifle',
    dmg: [35, 25], range: [28, 70], rpm: 950, mode: 'burst', burst: 3, burstDelay: 0.3, mag: 27, reserve: 162, reload: 2.2,
    spread: { hip: 3.0, ads: 0.25, move: 1.4, bloom: 0.2, max: 4, rec: 7 }, recoil: { v: 0.95, h: 0.3, kick: 0.03 },
    zoom: 1.65, ads: 0.24, speed: 0.98, headMul: 1.9, snd: 'burst', tracer: '#ffd27a', supp: 0.17, aiRange: 34,
    tint: '#5a5040', allow: ['scope', 'grip', 'extmag', 'suppressor'],
    model: [[0, 0.03, -0.02, 0.07, 0.12, 0.46, 'body'], [0, 0.045, -0.4, 0.032, 0.032, 0.22, M], [0, 0.03, -0.3, 0.075, 0.09, 0.16, 'body'], [0, -0.01, 0.27, 0.06, 0.12, 0.2, M2], [0, -0.09, 0.06, 0.04, 0.12, 0.055, BLK, -0.3], [0, -0.1, -0.12, 0.05, 0.14, 0.07, M, 0.1], [0, 0.1, -0.06, 0.03, 0.02, 0.32, M], [0, 0.11, 0.06, 0.03, 0.03, 0.02, M], [0, 0.1, -0.36, 0.01, 0.05, 0.01, M]],
    sightY: 0.125, muzzle: [0, 0.045, -0.52], magPart: [0, -0.1, -0.12, 0.05, 0.14, 0.07], gripAt: [0, -0.02, -0.3], scopeAt: [0.11, -0.08], hold: 'rifle',
  },
  shotgun: {
    id: 'shotgun', name: 'SG-12 BULLDOG', short: 'SHOTGUN', slot: 'primary', price: 600, cls: 'Shotgun',
    dmg: [15, 4], range: [7, 22], rpm: 75, mode: 'pump', mag: 6, reserve: 36, reload: 0.5, reloadPer: true, pellets: 9,
    spread: { hip: 5.5, ads: 4.0, move: 1.0, bloom: 0, max: 0, rec: 10 }, recoil: { v: 4.5, h: 1.0, kick: 0.09 },
    zoom: 1.2, ads: 0.2, speed: 1.0, headMul: 1.4, snd: 'shotgun', tracer: '#ffb060', supp: 0.25, aiRange: 9,
    tint: '#5a3a28', allow: ['grip', 'extmag', 'suppressor'],
    model: [[0, 0.03, -0.1, 0.065, 0.09, 0.3, M2], [0, 0.05, -0.45, 0.04, 0.04, 0.5, M], [0, 0.0, -0.42, 0.04, 0.035, 0.4, M], [0, -0.005, -0.33, 0.07, 0.065, 0.16, 'wood'], [0, -0.055, 0.25, 0.05, 0.11, 0.28, 'wood', -0.1], [0, -0.07, 0.04, 0.04, 0.1, 0.05, 'wood', -0.35], [0, 0.085, -0.1, 0.01, 0.02, 0.01, M], [0, 0.085, -0.68, 0.012, 0.02, 0.012, '#c8a030']],
    sightY: 0.092, muzzle: [0, 0.05, -0.71], magPart: [0, -0.005, -0.33, 0.07, 0.065, 0.16], gripAt: [0, -0.05, -0.33], scopeAt: [0.09, -0.1], hold: 'rifle',
  },
  lmg: {
    id: 'lmg', name: 'M-60X WARDEN', short: 'LMG', slot: 'primary', price: 1500, cls: 'Light Machine Gun',
    dmg: [30, 22], range: [28, 70], rpm: 720, mode: 'auto', mag: 90, reserve: 270, reload: 4.3,
    spread: { hip: 4.4, ads: 0.75, move: 2.0, bloom: 0.16, max: 4, rec: 5 }, recoil: { v: 0.95, h: 0.75, kick: 0.035 },
    zoom: 1.45, ads: 0.34, speed: 0.86, headMul: 1.6, snd: 'lmg', tracer: '#ff9a50', supp: 0.24, aiRange: 36,
    tint: '#3d4232', allow: ['scope', 'grip', 'extmag', 'suppressor'],
    model: [[0, 0.03, -0.05, 0.09, 0.13, 0.5, 'body'], [0, 0.04, -0.5, 0.04, 0.04, 0.4, M], [0, 0.03, -0.4, 0.07, 0.08, 0.2, M2], [0, -0.01, 0.3, 0.06, 0.12, 0.24, M2], [0, -0.1, 0.07, 0.045, 0.12, 0.06, BLK, -0.3], [0.03, -0.1, -0.08, 0.14, 0.13, 0.13, '#4a5038'], [0, 0.11, -0.05, 0.05, 0.03, 0.2, M], [0, -0.04, -0.62, 0.012, 0.16, 0.012, M, 0.4], [0, 0.115, 0.08, 0.03, 0.03, 0.02, M], [0, 0.11, -0.46, 0.01, 0.05, 0.01, M]],
    sightY: 0.135, muzzle: [0, 0.04, -0.71], magPart: [0.03, -0.1, -0.08, 0.14, 0.13, 0.13], gripAt: [0, -0.02, -0.38], scopeAt: [0.125, -0.08], hold: 'rifle',
  },
  dmr: {
    id: 'dmr', name: 'MK-14 RANGER', short: 'DMR', slot: 'primary', price: 1700, cls: 'Marksman Rifle',
    dmg: [52, 44], range: [40, 90], rpm: 330, mode: 'semi', mag: 12, reserve: 72, reload: 2.4,
    spread: { hip: 4.0, ads: 0.12, move: 2.2, bloom: 0.9, max: 5, rec: 6 }, recoil: { v: 2.6, h: 0.5, kick: 0.05 },
    zoom: 2.4, ads: 0.28, speed: 0.94, headMul: 2.0, snd: 'dmr', tracer: '#fff0b0', supp: 0.3, aiRange: 50,
    tint: '#6a5034', allow: ['scope', 'grip', 'extmag', 'suppressor'],
    model: [[0, 0.025, -0.08, 0.065, 0.1, 0.42, 'body'], [0, 0.04, -0.5, 0.03, 0.03, 0.42, M], [0, 0.02, -0.36, 0.07, 0.08, 0.26, 'wood'], [0, -0.01, 0.27, 0.06, 0.13, 0.28, 'wood', 0.08], [0, -0.09, 0.05, 0.04, 0.11, 0.05, BLK, -0.3], [0, -0.1, -0.1, 0.045, 0.12, 0.08, M, 0.1], [0, 0.09, -0.08, 0.026, 0.02, 0.28, M], [0, 0.105, 0.04, 0.028, 0.03, 0.02, M], [0, 0.098, -0.48, 0.01, 0.05, 0.01, M]],
    sightY: 0.118, muzzle: [0, 0.04, -0.72], magPart: [0, -0.1, -0.1, 0.045, 0.12, 0.08], gripAt: [0, -0.02, -0.36], scopeAt: [0.1, -0.08], hold: 'rifle',
  },
  sniper: {
    id: 'sniper', name: 'SR-50 HALCYON', short: 'SNIPER', slot: 'primary', price: 2400, cls: 'Sniper Rifle',
    dmg: [96, 82], range: [60, 140], rpm: 48, mode: 'bolt', mag: 5, reserve: 30, reload: 3.0,
    spread: { hip: 6.0, ads: 0.02, move: 3.0, bloom: 0, max: 0, rec: 6 }, recoil: { v: 5.5, h: 0.6, kick: 0.1 },
    zoom: 5.5, ads: 0.36, speed: 0.88, headMul: 2.6, snd: 'sniper', tracer: '#ffffff', supp: 0.45, aiRange: 70,
    tint: '#3a4a3a', allow: ['scope', 'grip', 'extmag', 'suppressor'], builtInScope: true,
    model: [[0, 0.025, -0.05, 0.065, 0.09, 0.38, 'body'], [0, 0.04, -0.6, 0.034, 0.034, 0.62, M], [0, 0.02, -0.33, 0.075, 0.08, 0.3, 'body'], [0, -0.01, 0.3, 0.06, 0.15, 0.3, 'body', 0.1], [0, -0.09, 0.07, 0.04, 0.11, 0.05, BLK, -0.3], [0, -0.09, -0.06, 0.05, 0.09, 0.08, M], [0.05, 0.05, 0.04, 0.05, 0.02, 0.02, M], [0.075, 0.05, 0.04, 0.025, 0.025, 0.025, M2], [0, 0.09, -0.06, 0.02, 0.02, 0.15, M]],
    sightY: 0.15, muzzle: [0, 0.04, -0.92], magPart: [0, -0.09, -0.06, 0.05, 0.09, 0.08], gripAt: [0, -0.02, -0.35], scopeAt: [0.13, -0.06], hold: 'rifle',
  },
  rocket: {
    id: 'rocket', name: 'RPX THUNDERCLAP', short: 'ROCKET', slot: 'secondary', price: 2800, cls: 'Rocket Launcher',
    dmg: [140, 140], range: [100, 100], rpm: 30, mode: 'semi', mag: 1, reserve: 4, reload: 3.2,
    spread: { hip: 1.8, ads: 0.4, move: 1.4, bloom: 0, max: 0, rec: 6 }, recoil: { v: 6, h: 1, kick: 0.14 },
    zoom: 1.6, ads: 0.35, speed: 0.86, headMul: 1, snd: 'rocket', tracer: '#ffb060', supp: 0.6, aiRange: 40,
    proj: { speed: 55, splash: 6.5 }, tint: '#4a5a3a', allow: [],
    model: [[0, 0.03, -0.15, 0.11, 0.11, 1.0, 'body'], [0, 0.03, -0.66, 0.14, 0.14, 0.08, M], [0, 0.03, 0.36, 0.13, 0.13, 0.06, M], [0, -0.07, 0.0, 0.04, 0.11, 0.05, BLK, -0.25], [0, -0.07, -0.25, 0.04, 0.1, 0.05, BLK, 0.2], [0.075, 0.1, -0.05, 0.03, 0.08, 0.1, M2], [0, 0.03, -0.72, 0.09, 0.09, 0.08, '#6a8040']],
    sightY: 0.13, muzzle: [0, 0.03, -0.72], magPart: [0, 0.03, -0.72, 0.09, 0.09, 0.12], gripAt: [0, -0.04, -0.3], scopeAt: [0.12, -0.1], hold: 'rocket',
  },
  knife: {
    id: 'knife', name: 'COMBAT KNIFE', short: 'KNIFE', slot: 'melee', price: 0, cls: 'Melee',
    dmg: [55, 55], range: [2.2, 2.2], rpm: 110, mode: 'melee', mag: 0, reserve: 0, reload: 0,
    spread: { hip: 0, ads: 0, move: 0, bloom: 0, max: 0, rec: 1 }, recoil: { v: 0, h: 0, kick: 0 },
    zoom: 1, ads: 0.1, speed: 1.08, headMul: 1.5, snd: 'knife', tracer: null, supp: 0, aiRange: 2,
    tint: '#3a3a3a', allow: [],
    model: [[0, 0.0, 0.03, 0.03, 0.03, 0.12, BLK], [0, 0.0, -0.04, 0.06, 0.025, 0.015, M], [0, 0.005, -0.15, 0.008, 0.035, 0.2, '#c8ccd0']],
    sightY: 0.05, muzzle: [0, 0, -0.25], hold: 'knife',
  },
};
export const PRIMARIES = ['ar', 'smg', 'shotgun', 'burst', 'lmg', 'dmr', 'sniper'];
export const SECONDARIES = ['pistol', 'rocket'];

export const ATTACH = {
  scope: { id: 'scope', name: 'SCOPE', desc: 'Magnified optic: more zoom, slower to aim', price: 350 },
  grip: { id: 'grip', name: 'FOREGRIP', desc: '30% less recoil, tighter hip fire', price: 300 },
  extmag: { id: 'extmag', name: 'EXT. MAG', desc: '+50% magazine, slightly slower reload', price: 300 },
  suppressor: { id: 'suppressor', name: 'SUPPRESSOR', desc: 'Quiet shots, hidden flash; a little less range', price: 400 },
};

export const GRENADES = {
  frag: { id: 'frag', name: 'FRAG GRENADE', price: 0, count: 2, fuse: 2.4, radius: 7, dmg: 125 },
  smoke: { id: 'smoke', name: 'SMOKE GRENADE', price: 250, count: 2, fuse: 1.4, radius: 6 },
};

// effective stats with attachments applied
export function statsFor(id, att = []) {
  const w = WEAPONS[id];
  const s = { ...w, spread: { ...w.spread }, recoil: { ...w.recoil }, dmg: w.dmg.slice(), range: w.range.slice(), att: att.slice() };
  if (att.includes('scope') || w.builtInScope) {
    if (!w.builtInScope) { s.zoom = Math.max(s.zoom * 1.75, 2.5); s.ads *= 1.35; s.spread.ads *= 0.7; }
    s.scoped = s.zoom >= 3.5;
  }
  if (att.includes('grip')) { s.recoil.v *= 0.68; s.recoil.h *= 0.6; s.spread.hip *= 0.85; s.spread.bloom *= 0.8; }
  if (att.includes('extmag')) { s.mag = Math.round(s.mag * 1.5); s.reload *= s.reloadPer ? 1 : 1.12; s.reserve = Math.round(s.reserve * 1.25); }
  if (att.includes('suppressor')) { s.suppressed = true; s.range = s.range.map((r) => r * 0.85); s.dmg = s.dmg.map((d) => d * 0.94); s.supp *= 0.7; }
  s.interval = 60 / s.rpm;
  return s;
}

export function damageAt(s, dist) {
  const [n, f] = s.range;
  if (dist <= n) return s.dmg[0];
  if (dist >= f) return s.dmg[1];
  return s.dmg[0] + (s.dmg[1] - s.dmg[0]) * ((dist - n) / (f - n));
}
