// The armory contract (assets/manifest.json) plus built-in placeholders that follow the same shape.
// Units are metres, +Z forward. Each gun exposes sockets: rail_top {start,end}, muzzle, under_rail,
// side_rail, magwell, grip_R, grip_L (and optionally eject, iron_rear, iron_front).
// Optics slide along rail_top; muzzle devices snap to muzzle; lasers take a runtime colour.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { safeMerge as mergeGeometries } from '../core/geom.js';
import { gltf, fetchJSON } from '../core/assets.js';

// ---------------------------------------------------------------- defaults (placeholder data)
const S = (x, y, z) => [x, y, z];
export const DEFAULT_MANIFEST = {
  arms: { file: null, bones: [], clips: { idle: 'idle', ads: 'ads', fire: 'fire', sprint: 'sprint', equip: 'equip', inspect: 'inspect' } },
  guns: [
    { id: 'm4', name: 'M4A1 Carbine', class: 'ar', file: null, modes: ['auto', 'semi'],
      stats: { rpm: 800, damage: 34, headMult: 100, mag: 30, reload: 2.3, recoil: { v: 0.55, h: 0.22, pattern: [[0, 1], [0.15, 1], [-0.1, 1.1], [0.3, 0.9], [0.25, 1], [-0.2, 0.9], [-0.35, 0.8], [0.1, 0.9]] }, spread: { hip: 3.2, ads: 0.06, move: 2.5 }, ads_time: 0.22, velocity: 880, move: 0.82, pen: 1.0, range: 120 },
      sockets: { rail_top: { start: S(0, 0.088, -0.1), end: S(0, 0.088, 0.33) }, muzzle: S(0, 0.046, 0.53), under_rail: S(0, -0.004, 0.3), side_rail: S(0.032, 0.046, 0.3), magwell: S(0, -0.005, 0.07), grip_R: S(0, -0.035, -0.045), grip_L: S(0, 0.0, 0.26), eject: S(0.03, 0.05, 0.02), iron_rear: S(0, 0.112, -0.08), iron_front: S(0, 0.112, 0.36) } },
    { id: 'ak', name: 'AK-74M', class: 'ar', file: null, modes: ['auto', 'semi'],
      stats: { rpm: 650, damage: 38, headMult: 100, mag: 30, reload: 2.6, recoil: { v: 0.72, h: 0.34, pattern: [[0, 1], [0.3, 1.1], [0.45, 1], [-0.2, 1.1], [-0.5, 0.9], [-0.3, 1], [0.4, 1], [0.6, 0.8]] }, spread: { hip: 3.6, ads: 0.08, move: 2.8 }, ads_time: 0.25, velocity: 880, move: 0.8, pen: 1.1, range: 110 },
      sockets: { rail_top: { start: S(0, 0.09, -0.06), end: S(0, 0.09, 0.12) }, muzzle: S(0, 0.04, 0.58), under_rail: S(0, -0.015, 0.3), side_rail: S(0.03, 0.04, 0.3), magwell: S(0, -0.01, 0.07), grip_R: S(0, -0.035, -0.045), grip_L: S(0, -0.004, 0.27), eject: S(0.03, 0.05, 0.02), iron_rear: S(0, 0.095, 0.1), iron_front: S(0, 0.095, 0.5) } },
    { id: 'mp5', name: 'MP5A3', class: 'smg', file: null, modes: ['auto', 'semi'],
      stats: { rpm: 850, damage: 26, headMult: 100, mag: 30, reload: 2.1, recoil: { v: 0.34, h: 0.18, pattern: [[0, 1], [0.1, 1], [-0.1, 1], [0.15, 0.9], [-0.15, 0.9]] }, spread: { hip: 2.4, ads: 0.1, move: 1.6 }, ads_time: 0.17, velocity: 400, move: 0.9, pen: 0.45, range: 50 },
      sockets: { rail_top: { start: S(0, 0.082, -0.08), end: S(0, 0.082, 0.14) }, muzzle: S(0, 0.04, 0.34), under_rail: S(0, -0.012, 0.2), side_rail: S(0.03, 0.04, 0.2), magwell: S(0, -0.005, 0.07), grip_R: S(0, -0.035, -0.045), grip_L: S(0, -0.004, 0.19), eject: S(0.03, 0.05, 0.03), iron_rear: S(0, 0.104, -0.05), iron_front: S(0, 0.104, 0.27) } },
    { id: 'm700', name: 'M700 Precision', class: 'sniper', file: null, modes: ['bolt'],
      stats: { rpm: 48, damage: 120, headMult: 100, mag: 5, reload: 3.2, recoil: { v: 3.2, h: 0.6, pattern: [[0, 1]] }, spread: { hip: 6, ads: 0.0, move: 4 }, ads_time: 0.36, velocity: 790, move: 0.72, pen: 2.2, range: 400, zero: 100 },
      sockets: { rail_top: { start: S(0, 0.085, -0.12), end: S(0, 0.085, 0.14) }, muzzle: S(0, 0.04, 0.78), under_rail: S(0, -0.02, 0.36), side_rail: S(0.03, 0.04, 0.34), magwell: S(0, -0.01, 0.03), grip_R: S(0, -0.035, -0.05), grip_L: S(0, -0.012, 0.28), eject: S(0.03, 0.05, 0.0), iron_rear: S(0, 0.1, -0.1), iron_front: S(0, 0.1, 0.7) },
      default: { optic: 'scope8' } },
    { id: 'm870', name: 'M870 Breacher', class: 'shotgun', file: null, modes: ['pump'],
      stats: { rpm: 75, damage: 20, pellets: 9, pelletSpread: 2.6, headMult: 100, mag: 7, reload: 0.55, perShell: true, recoil: { v: 2.4, h: 0.6, pattern: [[0, 1]] }, spread: { hip: 2.2, ads: 0.0, move: 1.2 }, ads_time: 0.26, velocity: 400, move: 0.82, pen: 0.4, range: 30 },
      sockets: { rail_top: { start: S(0, 0.09, -0.08), end: S(0, 0.09, 0.12) }, muzzle: S(0, 0.05, 0.62), under_rail: S(0, -0.03, 0.3), side_rail: S(0.03, 0.04, 0.3), magwell: S(0, -0.005, 0.07), grip_R: S(0, -0.035, -0.05), grip_L: S(0, -0.02, 0.3), eject: S(0.035, 0.05, 0.04), iron_rear: S(0, 0.1, 0.0), iron_front: S(0, 0.1, 0.6) } },
    { id: 'p226', name: 'P226 Sidearm', class: 'pistol', file: null, modes: ['semi'],
      stats: { rpm: 450, damage: 30, headMult: 100, mag: 15, reload: 1.7, recoil: { v: 1.1, h: 0.35, pattern: [[0, 1], [0.2, 1], [-0.2, 1]] }, spread: { hip: 1.8, ads: 0.12, move: 1.0 }, ads_time: 0.14, velocity: 350, move: 0.95, pen: 0.35, range: 40 },
      sockets: { rail_top: { start: S(0, 0.075, -0.02), end: S(0, 0.075, 0.03) }, muzzle: S(0, 0.05, 0.155), under_rail: S(0, 0.012, 0.09), side_rail: S(0.02, 0.03, 0.08), magwell: S(0, -0.02, -0.02), grip_R: S(0, -0.03, -0.035), grip_L: S(0.0, -0.035, -0.02), eject: S(0.02, 0.06, 0.03), iron_rear: S(0, 0.087, -0.05), iron_front: S(0, 0.087, 0.13) } },
  ],
  attachments: [
    { id: 'none_optic', name: 'Iron sights', slot: 'optic', file: null, mods: {}, optic: { zoom: 1, reticle: 'iron', eyeRelief: 0.18 } },
    { id: 'reddot', name: 'Micro red dot', slot: 'optic', file: null, mods: { ads_time: 0.0 }, optic: { zoom: 1.1, reticle: 'dot', eyeRelief: 0.2 } },
    { id: 'holo', name: 'Holographic sight', slot: 'optic', file: null, mods: { ads_time: 0.01 }, optic: { zoom: 1.15, reticle: 'holo', eyeRelief: 0.2 } },
    { id: 'acog', name: '4x prism (ACOG)', slot: 'optic', file: null, mods: { ads_time: 0.04 }, optic: { zoom: 4, reticle: 'chevron', eyeRelief: 0.1 } },
    { id: 'lpvo', name: '1-6x LPVO (at 3x)', slot: 'optic', file: null, mods: { ads_time: 0.05 }, optic: { zoom: 3, reticle: 'lpvo', eyeRelief: 0.12 } },
    { id: 'scope8', name: '8x precision scope', slot: 'optic', file: null, mods: { ads_time: 0.08 }, optic: { zoom: 8, reticle: 'mil', eyeRelief: 0.11 } },
    { id: 'none_muzzle', name: 'Bare muzzle', slot: 'muzzle', file: null, mods: {} },
    { id: 'flash', name: 'Flash hider', slot: 'muzzle', file: null, mods: { flash: 0.25 } },
    { id: 'comp', name: 'Compensator', slot: 'muzzle', file: null, mods: { recoil_v: -0.15, recoil_h: -0.12, flash: 1.3 } },
    { id: 'brake', name: 'Muzzle brake', slot: 'muzzle', file: null, mods: { recoil_v: -0.28, recoil_h: -0.2, flash: 1.6, loud: 1.3 } },
    { id: 'suppressor', name: 'Suppressor', slot: 'muzzle', file: null, mods: { suppressed: true, flash: 0.05, velocity: 0.04, ads_time: 0.03, recoil_v: -0.08, move: -0.02 } },
    { id: 'none_laser', name: 'No laser', slot: 'laser', file: null, mods: {} },
    { id: 'peq', name: 'IR/visible laser module', slot: 'laser', file: null, mods: { spread_hip: -0.3, ads_time: -0.01 } },
    { id: 'none_under', name: 'No underbarrel', slot: 'underbarrel', file: null, mods: {} },
    { id: 'vgrip', name: 'Vertical grip', slot: 'underbarrel', file: null, mods: { recoil_v: -0.12, recoil_h: -0.05, ads_time: 0.01 } },
    { id: 'angled', name: 'Angled grip', slot: 'underbarrel', file: null, mods: { ads_time: -0.025, recoil_h: -0.08 } },
    { id: 'std_mag', name: 'Standard magazine', slot: 'mag', file: null, mods: {} },
    { id: 'ext_mag', name: 'Extended magazine', slot: 'mag', file: null, mods: { mag_mult: 1.5, reload: 0.15, ads_time: 0.02, move: -0.02 } },
    { id: 'fast_mag', name: 'Coupled fast mag', slot: 'mag', file: null, mods: { reload: -0.22 } },
    { id: 'std_stock', name: 'Standard stock', slot: 'stock', file: null, mods: {} },
    { id: 'heavy_stock', name: 'Heavy precision stock', slot: 'stock', file: null, mods: { recoil_v: -0.15, recoil_h: -0.1, ads_time: 0.04, move: -0.03 } },
    { id: 'light_stock', name: 'Skeleton stock', slot: 'stock', file: null, mods: { recoil_v: 0.1, ads_time: -0.04, move: 0.03 } },
  ],
  camos: [
    { id: 'black', name: 'Black', color: '#1b1c1d' }, { id: 'fde', name: 'Flat dark earth', color: '#8a7454' }, { id: 'od', name: 'OD green', color: '#4a4f36' },
    { id: 'urban', name: 'Urban digital', color: '#6b6e70', pattern: 'digital' }, { id: 'tiger', name: 'Tiger stripe', color: '#5d5a3a', pattern: 'stripe' }, { id: 'snow', name: 'Arctic', color: '#d7dade', pattern: 'blotch' },
  ],
  gloves: [
    { id: 'black', name: 'Tactical black', color: '#1a1b1d' }, { id: 'coyote', name: 'Coyote', color: '#8b7556' }, { id: 'od', name: 'OD green', color: '#454a35' },
    { id: 'urban', name: 'Urban grey', color: '#5a5d61' }, { id: 'fingerless', name: 'Fingerless black', color: '#1e1f21', fingerless: true },
  ],
  sleeves: [
    { id: 'multicam', name: 'Multicam', color: '#77715a', pattern: 'blotch' }, { id: 'black', name: 'Black', color: '#202224' }, { id: 'urban', name: 'Urban', color: '#62666a', pattern: 'digital' },
    { id: 'snow', name: 'Snow', color: '#d4d7da', pattern: 'blotch' }, { id: 'desert', name: 'Desert', color: '#a48d68', pattern: 'digital' },
  ],
};

// armory class names -> internal
export function normClass(c) {
  c = String(c || '').toLowerCase();
  if (/pistol|handgun|sidearm/.test(c)) return 'pistol';
  if (/smg|submachine|pdw/.test(c)) return 'smg';
  if (/shot/.test(c)) return 'shotgun';
  if (/dmr|marksman/.test(c)) return 'dmr';
  if (/sniper|bolt|precision/.test(c)) return 'sniper';
  return 'ar';
}
const DMR_DEFAULT = { id: '_dmr', name: 'DMR', class: 'dmr', modes: ['semi'], stats: { rpm: 320, damage: 58, headMult: 100, mag: 20, reload: 2.6, recoil: { v: 1.25, h: 0.35, pattern: [[0, 1], [0.15, 1], [-0.15, 1]] }, spread: { hip: 4, ads: 0.03, move: 3 }, ads_time: 0.3, velocity: 840, move: 0.78, pen: 1.6, range: 250, zero: 100 } };
const DEFAULT_MODES = { ar: ['auto', 'semi'], smg: ['auto', 'semi'], dmr: ['semi'], sniper: ['bolt'], shotgun: ['pump'], pistol: ['semi'] };

// which attachment ids each gun class accepts (placeholders); real manifest may add `fits` on attachments
const CLASS_FITS = {
  pistol: { optic: ['none_optic', 'reddot'], muzzle: ['none_muzzle', 'comp', 'suppressor'], laser: ['none_laser', 'peq'], underbarrel: ['none_under'], mag: ['std_mag', 'ext_mag'], stock: ['std_stock'] },
  shotgun: { optic: ['none_optic', 'reddot', 'holo'], muzzle: ['none_muzzle', 'brake', 'suppressor'], underbarrel: ['none_under'], stock: ['std_stock', 'light_stock', 'heavy_stock'], mag: ['std_mag', 'ext_mag'] },
  sniper: { optic: ['scope8', 'lpvo', 'acog', 'reddot', 'none_optic'], muzzle: ['none_muzzle', 'brake', 'suppressor', 'flash'] },
  dmr: { optic: ['lpvo', 'acog', 'scope8', 'reddot', 'holo', 'none_optic'] },
};

// ---------------------------------------------------------------- manifest loading / hot swap
const MANIFEST_URL = new URLSearchParams(location.search).get('manifest') || 'assets/manifest.json';
export const Armory = {
  m: structuredClone(DEFAULT_MANIFEST),
  real: false, version: 0, _sig: '',
  gun(id) {
    const PLACE = { m4: 'ar', ak: 'ar', mp5: 'smg', m700: 'sniper', m870: 'shotgun', p226: 'pistol' };
    return this.m.guns.find(g => g.id === id) || (PLACE[id] && (this.m.guns.find(g => g.class === PLACE[id]) || (PLACE[id] === 'sniper' && this.m.guns.find(g => g.class === 'dmr')))) || this.m.guns[0];
  },
  att(id) { return this.m.attachments.find(a => a.id === id); },
  slotList(gun, slot) {
    const g = typeof gun === 'string' ? this.gun(gun) : gun;
    const all = this.m.attachments.filter(a => a.slot === slot);
    const list = all.filter(a => {
      if (a.fits) return a.fits.includes(g.id) || a.fits.includes(g.class);
      const cf = CLASS_FITS[g.class]?.[slot];
      return cf ? cf.includes(a.id) : !/^pistol_/.test(a.id);
    });
    return list.length ? list : all.slice(0, 1);
  },
  // poll assets/manifest.json: returns true if it changed (caller rebuilds models)
  async refresh() {
    const j = await fetchJSON(MANIFEST_URL);
    if (!j || !Array.isArray(j.guns) || !j.guns.length) return false;
    const sig = JSON.stringify(j);
    if (sig === this._sig) return false;
    this._sig = sig;
    const D = structuredClone(DEFAULT_MANIFEST);
    const m = { ...D, ...j };
    // keep placeholder attachments for slots the armory did not provide
    const slots = new Set((j.attachments || []).map(a => a.slot));
    m.attachments = [...(j.attachments || []).map(a => a.optic ? { ...a, optic: normOptic(a.optic) } : a), ...D.attachments.filter(a => !slots.has(a.slot))];
    for (const slot of ['optic', 'muzzle', 'laser', 'underbarrel', 'mag', 'stock']) {
      if (!m.attachments.some(a => a.slot === slot && /^none|^std/.test(a.id))) {
        const d = D.attachments.find(a => a.slot === slot && /^none|^std/.test(a.id)); if (d) m.attachments.unshift(d);
      }
    }
    m.guns = j.guns.map(g0 => {
      const g = { ...g0, class: normClass(g0.class || g0.cls) };
      const d = D.guns.find(x => x.id === g.id) || (g.class === 'dmr' ? DMR_DEFAULT : D.guns.find(x => x.class === g.class)) || D.guns[0];
      return { ...d, ...g, default: g.default || (g.class === 'sniper' ? { optic: 'scope8' } : g.class === 'dmr' ? { optic: 'lpvo' } : undefined), modes: g.modes || DEFAULT_MODES[g.class] || d.modes, stats: { ...d.stats, ...(g.stats || {}), recoil: { ...d.stats.recoil, ...(g.stats?.recoil || {}) }, spread: normSpread(g.stats?.spread, d.stats.spread) }, sockets: { ...d.sockets, ...(g.sockets || {}) } };
    });
    m.camos = j.camos?.length ? j.camos : D.camos;
    m.gloves = j.gloves?.length ? j.gloves : D.gloves;
    m.sleeves = j.sleeves?.length ? j.sleeves : D.sleeves;
    m.arms = { ...D.arms, ...(j.arms || {}), clips: { ...D.arms.clips, ...(j.arms?.clips || {}) } };
    applyOpticLineup(m);
    this.m = m; this.real = true; this.version++;
    console.log('[armory] manifest loaded: ' + m.guns.length + ' guns, ' + m.attachments.length + ' attachments, arms ' + (m.arms.file || 'placeholder'));
    return true;
  },
};
// The optic lineup (iron / 1x red dot / 1x holo / 2x / 3x / 4x ACOG / 6x / 8x): every one is a model on
// the gun with its own reticle and zoom; more zoom = more sway and a slower ADS. Armory optics keep their
// models, the 2x and the ACOG are built here (buildPlaceholderAttachment), irons are rebuilt thin (buildIrons).
const RIFLES = ['ar14', 'vx9', 'm38', 'lr338', 'h12'];
function applyOpticLineup(m) {
  const A = m.attachments, set = (id, o) => { const a = A.find(x => x.id === id); if (a) Object.assign(a, o, { optic: a.optic ? { ...a.optic, ...(o.optic || {}) } : o.optic, mods: { ...(a.mods || {}), ...(o.mods || {}) } }); };
  const noneO = A.find(a => a.id === 'none_optic'); if (noneO) noneO.name = 'Iron sights - aperture';
  set('reddot', { name: 'Red dot (1x)' }); set('holo', { name: 'Holographic (1x)' }); set('mrds', { name: 'Mini red dot (1x)' });
  set('prism3x', { name: '3x prism', mods: { ads_time: 0.035, sway: 1 } });
  set('lpvo', { name: '6x LPVO', fits: ['ar14', 'm38', 'lr338'], optic: { zoom: 6, zoomMin: 1, reticle: 'lpvo' }, mods: { ads_time: 0.07, sway: 1, move: -0.01 } });
  set('scope8x', { name: '8x sniper scope' });
  const add = a => { if (!A.some(x => x.id === a.id)) A.splice(A.findIndex(x => x.slot === 'optic') + 1, 0, a); };
  add({ id: 'acog', name: '4x ACOG', slot: 'optic', file: null, fits: ['ar14', 'vx9', 'm38', 'lr338'], mods: { ads_time: 0.05, sway: 1, move: -0.008 }, optic: { zoom: 4, reticle: 'chevron', eyeRelief: 0.07, sightHeight: 0.038, color: '#ff3a1a', pip: true } });
  add({ id: 'optic2x', name: '2x mini prism', slot: 'optic', file: null, fits: RIFLES, mods: { ads_time: 0.02, sway: 1 }, optic: { zoom: 2, reticle: 'lpvo', eyeRelief: 0.07, sightHeight: 0.036, color: '#ff3a1a', pip: true } });
  add({ id: 'iron_ghost', name: 'Iron sights - ghost ring (thin)', slot: 'optic', file: null, fits: RIFLES, mods: { ads_time: -0.01 }, optic: { zoom: 1, reticle: 'iron', irons: 'ghost', eyeRelief: 0.12 } });
  const order = ['none_optic', 'iron_ghost', 'reddot', 'mrds', 'holo', 'optic2x', 'prism3x', 'acog', 'lpvo', 'scope8x'];
  const opt = A.filter(a => a.slot === 'optic').sort((a, b) => (order.indexOf(a.id) + 99) % 99 - (order.indexOf(b.id) + 99) % 99);
  m.attachments = [...opt, ...A.filter(a => a.slot !== 'optic')];
}
// armory optic block -> what the viewmodel needs: zoom (max of a variable range), a reticle family
// the lens shaders know, and an eye relief (collimated dots have none; the eye sits ~15 cm back)
export function normOptic(o) {
  const z = Array.isArray(o.zoom) ? o.zoom : [o.zoom ?? 1], zoom = Math.max(...z);
  const r = String(o.reticle || 'dot').toLowerCase();
  const reticle = /iron/.test(r) ? 'iron' : /mil/.test(r) ? 'mil' : /chevron|prism|acog/.test(r) ? 'chevron' : /lpvo|bdc/.test(r) ? 'lpvo' : /holo/.test(r) ? 'holo' : 'dot';
  return { ...o, zoom, zoomMin: Math.min(...z), reticle, reticleName: o.reticle, eyeRelief: o.eyeRelief ?? (zoom >= 2 ? 0.09 : 0.16) };
}
function normSpread(s, d) {
  if (s == null) return d;
  if (typeof s === 'number') return { hip: s, ads: Math.max(0.03, s * 0.04), move: s * 0.8 };
  return { ...d, ...s };
}
export function assetUrl(f) { return !f ? null : (f.startsWith('/') || /^https?:/.test(f)) ? f : 'assets/' + f.replace(/^assets\//, ''); }

// ---------------------------------------------------------------- loadout + derived stats
export function defaultConfig(gunId) {
  const g = Armory.gun(gunId);
  const pick = slot => (g.default && g.default[slot]) || Armory.slotList(g, slot)[0]?.id;
  return { gun: g.id, optic: pick('optic'), rail: 0.5, muzzle: pick('muzzle'), laser: pick('laser'), laserColor: '#ff2020', laserOn: true,
    underbarrel: pick('underbarrel'), mag: pick('mag'), stock: pick('stock'), camo: Armory.m.camos[0].id, glove: (Armory.m.gloves.find(x => x.id === 'black') || Armory.m.gloves[0]).id, sleeve: Armory.m.sleeves[0].id };
}
export function validateConfig(cfg) {
  const g = Armory.gun(cfg.gun); const d = defaultConfig(g.id);
  const out = { ...d, ...cfg, gun: g.id };
  for (const slot of ['optic', 'muzzle', 'laser', 'underbarrel', 'mag', 'stock']) if (!Armory.slotList(g, slot).some(a => a.id === out[slot])) out[slot] = d[slot];
  if (!Armory.m.camos.some(c => c.id === out.camo)) out.camo = d.camo;
  if (!Armory.m.gloves.some(c => c.id === out.glove)) out.glove = d.glove;
  if (!Armory.m.sleeves.some(c => c.id === out.sleeve)) out.sleeve = d.sleeve;
  out.rail = THREE.MathUtils.clamp(+out.rail || 0, 0, 1);
  return out;
}
export function computeStats(cfg) {
  const g = Armory.gun(cfg.gun), s = g.stats;
  const mods = ['optic', 'muzzle', 'laser', 'underbarrel', 'mag', 'stock'].map(k => Armory.att(cfg[k])?.mods || {});
  const sum = k => mods.reduce((a, m) => a + (m[k] || 0), 0);
  const optic = Armory.att(cfg.optic)?.optic || { zoom: 1, reticle: 'iron', eyeRelief: 0.18 };
  const magMult = mods.reduce((a, m) => a * (m.mag_mult || 1), 1);
  const spread = s.spread || { hip: 3, ads: 0.1, move: 2 };
  return {
    gun: g, cls: g.class, name: g.name, modes: g.modes || ['semi'],
    rpm: s.rpm, damage: s.damage, pellets: s.pellets || 1, pelletSpread: s.pelletSpread || 0, perShell: !!s.perShell,
    mag: Math.round(s.mag * magMult), reload: s.reload * (1 + sum('reload')),
    recoilV: s.recoil.v * (1 + sum('recoil_v')), recoilH: s.recoil.h * (1 + sum('recoil_h')), pattern: s.recoil.pattern || [[0, 1]],
    hip: spread.hip * (1 + sum('spread_hip')), ads: spread.ads, moveSpread: spread.move,
    adsTime: Math.max(0.08, s.ads_time + sum('ads_time')), velocity: s.velocity * (1 + sum('velocity')),
    move: (s.move || 0.85) + sum('move'), pen: s.pen ?? 1, range: s.range || 100, zero: s.zero || (g.class === 'sniper' ? 100 : 50),
    suppressed: mods.some(m => m.suppressed), flash: mods.reduce((a, m) => a * (m.flash ?? 1), 1), loud: mods.reduce((a, m) => a * (m.loud ?? 1), 1),
    optic, laser: cfg.laser && !/^none/.test(cfg.laser),
    // scope sway (radians of drift while aimed): grows with magnification, damped by grips and stocks
    sway: (optic.zoom > 1.2 ? 0.00032 * optic.zoom : 0.0001) * mods.reduce((a, m) => a * (m.sway || 1), 1),
  };
}

// ---------------------------------------------------------------- procedural materials
function noiseTex(size, seed, fn) {
  const c = document.createElement('canvas'); c.width = c.height = size;
  const g = c.getContext('2d'), img = g.createImageData(size, size);
  let s = seed; const R = () => (s = (s * 16807) % 2147483647) / 2147483647;
  for (let i = 0; i < size * size; i++) { const v = fn(i % size, Math.floor(i / size), R); img.data[i * 4] = v[0]; img.data[i * 4 + 1] = v[1]; img.data[i * 4 + 2] = v[2]; img.data[i * 4 + 3] = 255; }
  g.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; return t;
}
let _wear = null;
function wearTex() { // roughness variation + edge wear for metal
  if (_wear) return _wear;
  _wear = noiseTex(256, 7, (x, y, R) => { const v = 150 + R() * 60 + Math.sin(x * 0.3) * 6; return [v, v, v]; });
  return _wear;
}
const patternCache = new Map();
export function patternTexture(color, pattern) {
  const key = color + pattern; if (patternCache.has(key)) return patternCache.get(key);
  const base = new THREE.Color(color);
  const c = document.createElement('canvas'); c.width = c.height = 256; const g = c.getContext('2d');
  g.fillStyle = '#' + base.getHexString(); g.fillRect(0, 0, 256, 256);
  let s = 99; const R = () => (s = (s * 16807) % 2147483647) / 2147483647;
  const shade = k => '#' + base.clone().multiplyScalar(k).getHexString();
  if (pattern === 'digital') { for (let i = 0; i < 900; i++) { g.fillStyle = shade([0.6, 0.8, 1.25, 0.45][i % 4]); g.fillRect(Math.floor(R() * 64) * 4, Math.floor(R() * 64) * 4, 4 + Math.floor(R() * 3) * 4, 4 + Math.floor(R() * 2) * 4); } }
  else if (pattern === 'stripe') { for (let i = 0; i < 26; i++) { g.fillStyle = shade(i % 2 ? 0.35 : 0.65); g.beginPath(); const y = R() * 256; g.moveTo(0, y); for (let x = 0; x <= 256; x += 16) g.lineTo(x, y + Math.sin(x * 0.05 + i) * 10 + R() * 8); for (let x = 256; x >= 0; x -= 16) g.lineTo(x, y + 6 + Math.sin(x * 0.04 + i) * 6); g.fill(); } }
  else if (pattern === 'blotch') { for (let i = 0; i < 70; i++) { g.fillStyle = shade([0.55, 0.8, 1.2, 0.4][i % 4]); g.beginPath(); const x = R() * 256, y = R() * 256; for (let a = 0; a < 6.3; a += 0.6) { const r = 10 + R() * 18; g.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r); } g.fill(); } }
  // fabric/polymer grain
  const id = g.getImageData(0, 0, 256, 256); for (let i = 0; i < id.data.length; i += 4) { const n = (R() - 0.5) * 14; id.data[i] += n; id.data[i + 1] += n; id.data[i + 2] += n; } g.putImageData(id, 0, 0);
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace; t.repeat.set(4, 4);
  patternCache.set(key, t); return t;
}
export function makeGunMats(camo) {
  const metal = new THREE.MeshPhysicalMaterial({ color: 0x232527, metalness: 0.8, roughness: 0.4, roughnessMap: wearTex(), clearcoat: 0.15, clearcoatRoughness: 0.5 });
  const steel = new THREE.MeshPhysicalMaterial({ color: 0x3a3c3f, metalness: 0.95, roughness: 0.28 });
  const c = camo || { color: '#1b1c1d' };
  const poly = new THREE.MeshPhysicalMaterial({ color: c.pattern ? 0xffffff : new THREE.Color(c.color), map: c.pattern ? patternTexture(c.color, c.pattern) : null, metalness: 0.05, roughness: 0.62, sheen: 0.2 });
  poly.userData.paint = true;
  const wood = new THREE.MeshPhysicalMaterial({ color: 0x5a2f18, roughness: 0.45, clearcoat: 0.4, clearcoatRoughness: 0.35 });
  const rubber = new THREE.MeshStandardMaterial({ color: 0x101010, roughness: 0.9 });
  const glass = new THREE.MeshPhysicalMaterial({ color: 0x223040, metalness: 0, roughness: 0.05, transmission: 0, transparent: true, opacity: 0.35, envMapIntensity: 2 });
  const brass = new THREE.MeshPhysicalMaterial({ color: 0xb08d4a, metalness: 1, roughness: 0.3 });
  return { metal, steel, poly, wood, rubber, glass, brass };
}

// ---------------------------------------------------------------- placeholder geometry helpers
function rb(w, h, d, r = 0.004) { return new RoundedBoxGeometry(w, h, d, 2, Math.min(r, w / 2.2, h / 2.2, d / 2.2)); }
function cyl(r0, r1, len, seg = 16) { return new THREE.CylinderGeometry(r1, r0, len, seg).rotateX(Math.PI / 2); }   // along +Z, r0 at -Z
function at(geo, x, y, z, rx = 0, ry = 0, rz = 0) { geo.applyMatrix4(new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(rx, ry, rz))); geo.translate(x, y, z); return geo; }
// picatinny rail (top) between z0 and z1 at height y
function rail(z0, z1, y, w = 0.022) {
  const parts = [at(rb(w, 0.008, z1 - z0, 0.001), 0, y - 0.004, (z0 + z1) / 2)];
  for (let z = z0 + 0.005; z < z1 - 0.004; z += 0.01) parts.push(at(rb(w + 0.002, 0.004, 0.005, 0.0008), 0, y + 0.001, z));
  return mergeGeometries(parts);
}
function group(name) { const g = new THREE.Group(); g.name = name; return g; }
function mesh(geos, mat, name) { const m = new THREE.Mesh(Array.isArray(geos) ? mergeGeometries(geos) : geos, mat); m.name = name || ''; m.castShadow = true; return m; }
function socket(root, name, p) { const o = new THREE.Object3D(); o.name = name; o.position.set(p[0], p[1], p[2]); root.add(o); return o; }

// Gun placeholders: real-proportioned, built from rounded boxes and cylinders.
function buildPlaceholderGun(def, M) {
  const root = group(def.id);
  const s = def.sockets, mz = s.muzzle[2], rt = s.rail_top;
  const met = [], pol = [], stl = [], wd = [], rub = [];
  const cls = def.class;
  if (cls === 'pistol') {
    met.push(at(rb(0.03, 0.034, 0.19, 0.005), 0, 0.055, 0.055));                 // slide
    for (let i = 0; i < 7; i++) met.push(at(rb(0.031, 0.026, 0.002, 0.0005), 0, 0.055, -0.03 + i * 0.006)); // serrations
    pol.push(at(rb(0.028, 0.03, 0.15, 0.006), 0, 0.022, 0.04));                  // frame
    pol.push(at(rb(0.03, 0.11, 0.045, 0.008), 0, -0.035, -0.035, -0.28));        // grip
    pol.push(at(new THREE.TorusGeometry(0.018, 0.003, 6, 12, Math.PI), 0, 0.004, 0.02, 0, Math.PI / 2, Math.PI)); // trigger guard
    stl.push(at(cyl(0.006, 0.006, 0.02), 0, 0.05, 0.15));
    met.push(at(rb(0.006, 0.008, 0.008), 0, 0.077, 0.13), at(rb(0.02, 0.008, 0.006), 0, 0.077, -0.04));
  } else {
    // receiver
    const rL = cls === 'smg' ? 0.26 : cls === 'sniper' ? 0.24 : 0.26;
    met.push(at(rb(0.05, 0.06, rL, 0.006), 0, 0.048, 0.01 + (cls === 'smg' ? 0.03 : 0)));
    met.push(at(rb(0.044, 0.045, rL * 0.8, 0.006), 0, 0.0, 0.03));                // lower
    // handguard
    if (cls === 'ar' && def.id !== 'ak') {
      const h0 = 0.14, h1 = 0.37;
      pol.push(at(rb(0.052, 0.056, h1 - h0, 0.008), 0, 0.044, (h0 + h1) / 2));
      for (let z = h0 + 0.02; z < h1 - 0.02; z += 0.035) pol.push(at(rb(0.054, 0.012, 0.016, 0.003), 0, 0.044, z));
      met.push(rail(rt.start[2], rt.end[2], rt.start[1]));
      met.push(at(rb(0.012, 0.03, 0.02), 0, 0.1, 0.36));                         // front sight post
      met.push(at(rb(0.02, 0.02, 0.025), 0, 0.1, -0.08));                        // rear sight
    } else if (def.id === 'ak') {
      wd.push(at(rb(0.05, 0.05, 0.2, 0.012), 0, 0.03, 0.26));                     // wooden handguard
      met.push(at(cyl(0.012, 0.012, 0.2), 0, 0.072, 0.26));                       // gas tube
      met.push(at(rb(0.05, 0.02, 0.24, 0.006), 0, 0.08, 0.01));                   // dust cover
      met.push(rail(rt.start[2], rt.end[2], rt.start[1], 0.02));
      met.push(at(rb(0.01, 0.035, 0.012), 0, 0.085, 0.5));
    } else if (cls === 'smg') {
      pol.push(at(rb(0.055, 0.05, 0.13, 0.014), 0, 0.03, 0.2));
      met.push(rail(rt.start[2], rt.end[2], rt.start[1], 0.02));
      met.push(at(cyl(0.014, 0.014, 0.022), 0, 0.098, 0.26), at(cyl(0.012, 0.012, 0.02), 0, 0.098, -0.05));
    } else if (cls === 'sniper') {
      pol.push(at(rb(0.06, 0.07, 0.5, 0.014), 0, 0.0, 0.18));                     // chassis forend
      met.push(rail(rt.start[2], rt.end[2], rt.start[1]));
      stl.push(at(cyl(0.004, 0.004, 0.06), 0.045, 0.05, -0.02, 0, 0, 0), at(new THREE.SphereGeometry(0.009, 10, 8), 0.075, 0.05, -0.02)); // bolt handle
    } else if (cls === 'shotgun') {
      pol.push(at(rb(0.05, 0.05, 0.18, 0.014), 0, -0.01, 0.32));                  // pump
      for (let z = 0.25; z < 0.4; z += 0.02) pol.push(at(rb(0.053, 0.006, 0.006, 0.002), 0, -0.01, z));
      stl.push(at(cyl(0.013, 0.013, 0.4), 0, -0.012, 0.36));                      // magazine tube
      met.push(rail(rt.start[2], rt.end[2], rt.start[1], 0.02));
      met.push(at(new THREE.SphereGeometry(0.004, 8, 6), 0, 0.075, 0.6));         // bead
    }
    // barrel
    const b0 = cls === 'smg' ? 0.16 : 0.12, br = cls === 'sniper' ? 0.012 : cls === 'shotgun' ? 0.012 : 0.0095;
    stl.push(at(cyl(br, br * 0.92, mz - b0), 0, s.muzzle[1], (mz + b0) / 2));
    // grip
    pol.push(at(rb(0.032, 0.1, 0.042, 0.01), 0, -0.04, -0.05, -0.32));
    pol.push(at(new THREE.TorusGeometry(0.022, 0.003, 6, 12, Math.PI), 0, -0.018, 0.0, 0, Math.PI / 2, Math.PI));
    // magazine
    if (cls !== 'shotgun' && def.mag !== false) {
      const mg = group('mag');
      const mm = [];
      if (def.id === 'ak') for (let k = 0; k < 8; k++) mm.push(at(rb(0.024, 0.03, 0.07, 0.004), 0, -0.02 - k * 0.022, 0.01 + k * 0.009, 0.12 + k * 0.03));
      else if (cls === 'sniper') mm.push(at(rb(0.028, 0.05, 0.08, 0.004), 0, -0.03, 0.03));
      else if (cls === 'smg') for (let k = 0; k < 7; k++) mm.push(at(rb(0.022, 0.03, 0.04, 0.003), 0, -0.02 - k * 0.022, 0.0 + k * 0.006, 0.12 + k * 0.03));
      else for (let k = 0; k < 7; k++) mm.push(at(rb(0.024, 0.03, 0.062, 0.004), 0, -0.02 - k * 0.022, 0.0 + k * 0.005, 0.06 + k * 0.02));
      const magMesh = mesh(mm.map(g => g.translate(-s.magwell[0], -s.magwell[1], -s.magwell[2])), cls === 'ar' && def.id !== 'ak' ? M.metal : M.poly, 'magazine');
      mg.add(magMesh); mg.position.set(...s.magwell); root.add(mg);
    }
  }
  // stock
  if (cls === 'ar' || cls === 'smg' || cls === 'sniper' || cls === 'shotgun') {
    const st = group('stock');
    const sp = [];
    if (def.id === 'ak') { met.push(at(rb(0.03, 0.03, 0.18, 0.004), 0, 0.02, -0.2)); sp.push(at(rb(0.035, 0.12, 0.05, 0.01), 0, -0.015, -0.3)); }
    else if (cls === 'sniper' || cls === 'shotgun') sp.push(at(rb(0.04, 0.1, 0.3, 0.012), 0, 0.0, -0.27, 0.06), at(rb(0.042, 0.11, 0.02, 0.008), 0, -0.005, -0.42));
    else { stl.push(at(cyl(0.015, 0.015, 0.2), 0, 0.045, -0.2)); sp.push(at(rb(0.04, 0.07, 0.15, 0.012), 0, 0.03, -0.3), at(rb(0.042, 0.11, 0.02, 0.006), 0, 0.005, -0.375)); }
    st.add(mesh(sp, M.poly, 'stock_shell'));
    root.add(st);
  }
  if (met.length) root.add(mesh(met, M.metal, 'receiver'));
  if (pol.length) root.add(mesh(pol, M.poly, 'furniture'));
  if (stl.length) root.add(mesh(stl, M.steel, 'barrel'));
  if (wd.length) root.add(mesh(wd, M.wood, 'wood'));
  if (rub.length) root.add(mesh(rub, M.rubber, 'rubber'));
  return root;
}

function buildPlaceholderAttachment(def, M) {
  const g = group(def.id);
  const add = (geos, mat, name) => g.add(mesh(geos, mat, name));
  const sight = (y, z) => socket(g, 'sight', [0, y, z]);
  switch (def.id) {
    case 'reddot': add([at(rb(0.022, 0.012, 0.03), 0, 0.006, 0), at(rb(0.026, 0.026, 0.028, 0.006), 0, 0.026, 0)], M.metal, 'body');
      g.add(lensMesh(0.0095, 0.03, 0.0, 'lens_dot', M)); sight(0.03, -0.014); socket(g, 'lens', [0, 0.03, 0.0]); break;
    case 'holo': add([at(rb(0.032, 0.012, 0.09), 0, 0.006, 0), at(rb(0.036, 0.008, 0.07, 0.003), 0, 0.054, 0.005), at(rb(0.006, 0.05, 0.07), 0.016, 0.03, 0.005), at(rb(0.006, 0.05, 0.07), -0.016, 0.03, 0.005), at(rb(0.034, 0.02, 0.04), 0, 0.02, -0.03)], M.metal, 'body');
      g.add(lensMesh(0.0, 0.034, 0.03, 'lens_holo', M, [0.028, 0.034])); sight(0.034, -0.05); socket(g, 'lens', [0, 0.034, 0.03]); break;
    case 'acog': add([at(rb(0.03, 0.014, 0.06), 0, 0.007, 0), at(cyl(0.016, 0.019, 0.11), 0, 0.038, 0.01), at(rb(0.034, 0.028, 0.05, 0.006), 0, 0.034, 0.0)], M.metal, 'body');
      g.add(lensMesh(0.015, 0.038, -0.046, 'lens', M)); sight(0.038, -0.05); socket(g, 'lens', [0, 0.038, -0.046]); break;
    case 'optic2x': add([at(rb(0.026, 0.012, 0.05), 0, 0.006, 0), at(rb(0.03, 0.03, 0.06, 0.007), 0, 0.03, 0), at(cyl(0.013, 0.015, 0.02), 0, 0.036, 0.035), at(rb(0.008, 0.012, 0.016, 0.003), 0.017, 0.032, 0)], M.metal, 'body');
      g.add(lensMesh(0.012, 0.036, -0.031, 'lens', M)); sight(0.036, -0.035); socket(g, 'lens', [0, 0.036, -0.031]); break;
    case 'lpvo': case 'scope8': {
      const L = def.id === 'scope8' ? 0.34 : 0.27, rr = def.id === 'scope8' ? 0.022 : 0.018;
      add([at(cyl(0.015, 0.015, L * 0.55), 0, 0.045, 0), at(cyl(0.02, 0.015, 0.05), 0, 0.045, -L / 2 + 0.03), at(cyl(0.015, rr, 0.08), 0, 0.045, L / 2 - 0.05), at(cyl(rr, rr, 0.03), 0, 0.045, L / 2 - 0.0),
        at(cyl(0.016, 0.016, 0.02), 0, 0.068, 0.0, Math.PI / 2), at(cyl(0.016, 0.016, 0.02), 0.022, 0.045, 0.0, 0, 0, Math.PI / 2).rotateZ(0),
        at(rb(0.03, 0.04, 0.025), 0, 0.02, -0.06), at(rb(0.03, 0.04, 0.025), 0, 0.02, 0.06)], M.metal, 'body');
      g.add(lensMesh(0.0175, 0.045, -L / 2 + 0.005, 'lens', M)); sight(0.045, -L / 2); socket(g, 'lens', [0, 0.045, -L / 2 + 0.005]); break;
    }
    case 'flash': add([at(cyl(0.012, 0.012, 0.05), 0, 0, 0.025), ...[0, 1, 2].map(k => at(rb(0.004, 0.004, 0.025), Math.cos(k * 2.1) * 0.01, Math.sin(k * 2.1) * 0.01, 0.06))], M.metal); socket(g, 'muzzle', [0, 0, 0.07]); break;
    case 'comp': add([at(cyl(0.013, 0.013, 0.055), 0, 0, 0.028), at(rb(0.03, 0.006, 0.01), 0, 0.012, 0.03)], M.metal); socket(g, 'muzzle', [0, 0, 0.058]); break;
    case 'brake': add([at(cyl(0.016, 0.016, 0.07), 0, 0, 0.035), at(rb(0.036, 0.012, 0.012), 0, 0, 0.02), at(rb(0.036, 0.012, 0.012), 0, 0, 0.045)], M.metal); socket(g, 'muzzle', [0, 0, 0.072]); break;
    case 'suppressor': add([at(cyl(0.019, 0.019, 0.17, 20), 0, 0, 0.09), at(cyl(0.014, 0.019, 0.02), 0, 0, 0.005)], M.metal); socket(g, 'muzzle', [0, 0, 0.18]); break;
    case 'peq': add([at(rb(0.03, 0.03, 0.075, 0.004), 0.012, 0, 0), at(cyl(0.006, 0.006, 0.006), 0.018, 0.006, 0.04), at(cyl(0.004, 0.004, 0.006), 0.006, -0.006, 0.04)], M.poly); socket(g, 'laser', [0.018, 0.006, 0.045]); break;
    case 'vgrip': add([at(cyl(0.015, 0.016, 0.1), 0, -0.055, 0, Math.PI / 2 + 0.05), at(rb(0.024, 0.012, 0.04), 0, -0.006, 0)], M.poly); socket(g, 'grip_L', [0, -0.07, 0]); break;
    case 'angled': add([at(rb(0.022, 0.03, 0.07, 0.008), 0, -0.018, 0, -0.45)], M.poly); socket(g, 'grip_L', [0, -0.02, 0.0]); break;
    default: break;
  }
  return g;
}
// lens disc facing -Z (toward the shooter); material swapped by the viewmodel for reticles / PIP
function lensMesh(r, y, z, name, M, rect) {
  const geo = rect ? new THREE.PlaneGeometry(rect[0], rect[1]) : new THREE.CircleGeometry(r, 32);
  geo.rotateY(Math.PI);
  const m = new THREE.Mesh(geo, M.glass.clone()); m.name = name; m.position.set(0, y, z); m.userData.lens = true; return m;
}

// ---------------------------------------------------------------- assemble a configured weapon
// Returns { root, gun, sockets{name:Object3D}, sight:{obj, front?}, optic, lens, laser, muzzle, mag, eject, gripR, gripL, mats }
export async function buildWeapon(cfg) {
  cfg = validateConfig(cfg);
  const def = Armory.gun(cfg.gun);
  const camo = Armory.m.camos.find(c => c.id === cfg.camo);
  const M = makeGunMats(camo);
  let root = null;
  if (def.file) {
    const g = await gltfSafe(assetUrl(def.file));
    if (g) { root = g.scene.clone(true); root.userData.anims = g.animations || []; applyCamo(root, camo, def); }
  }
  if (!root) root = buildPlaceholderGun(def, M);
  root.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; o.frustumCulled = false; } });
  const holder = group('weapon:' + def.id); holder.add(root);
  // sockets: prefer named empties in the GLB, else manifest coordinates
  const sk = {};
  const ALIAS = { eject: ['ejection', 'socket_ejection', 'socket_eject'], iron_rear: ['sight_iron_rear', 'socket_iron_rear'], iron_front: ['sight_iron_front', 'socket_iron_front'], rail_top_start: ['socket_rail_top_start'], rail_top_end: ['socket_rail_top_end'] };
  const findNode = name => root.getObjectByName(name) || root.getObjectByName('socket_' + name) || (ALIAS[name] || []).map(n => root.getObjectByName(n)).find(Boolean) || null;
  const getSock = (name, pos) => { let o = findNode(name); if (!o && pos) o = socket(root, name, pos); return o; };
  const rs = def.sockets.rail_top || { start: [0, 0.08, -0.1], end: [0, 0.08, 0.2] };
  sk.rail_start = getSock('rail_top_start', rs.start) ; sk.rail_end = getSock('rail_top_end', rs.end);
  for (const n of ['muzzle', 'under_rail', 'side_rail', 'magwell', 'grip_R', 'grip_L', 'eject', 'iron_rear', 'iron_front', 'stock']) sk[n] = getSock(n, def.sockets[n] || (n === 'eject' ? (def.sockets.ejection || [0.03, 0.05, 0.02]) : n === 'iron_rear' ? def.ironSight?.rear : n === 'iron_front' ? def.ironSight?.front : null));
  if (!sk.iron_rear) sk.iron_rear = socket(root, 'iron_rear', [rs.start[0], rs.start[1] + 0.025, rs.start[2]]);
  if (!sk.iron_front) sk.iron_front = socket(root, 'iron_front', [rs.end[0], rs.end[1] + 0.025, rs.end[2] + 0.05]);
  const out = { root: holder, model: root, def, cfg, sockets: sk, mats: M, anims: (def.file && root.userData.anims) || [], sight: { obj: sk.iron_rear, front: sk.iron_front, iron: true }, optic: null, lens: null, laser: null, muzzle: sk.muzzle, eject: sk.eject, gripR: sk.grip_R, gripL: sk.grip_L, mag: root.getObjectByName('mag') || root.getObjectByName('magazine') };
  if (out.anims.length) { out.mixer = new THREE.AnimationMixer(root); }
  // attachments
  const attach = async (slot, id, parent, pos) => {
    const a = Armory.att(id); if (!a || /^none|^std/.test(a.id) && !a.file) return null;
    let o = null;
    if (a.file) { const g = await gltfSafe(assetUrl(a.file)); if (g) o = g.scene.clone(true); }
    if (!o) o = buildPlaceholderAttachment(a, M);
    if (!o.children.length) return null;
    o.traverse(m => { if (m.isMesh) { m.castShadow = true; m.frustumCulled = false; } });
    o.name = 'att:' + slot;
    if (pos) o.position.copy(pos);
    parent.add(o);
    return o;
  };
  // optic: slides along the rail (u = cfg.rail)
  const railPos = new THREE.Vector3().lerpVectors(sk.rail_start.position, sk.rail_end.position, cfg.rail);
  const optic = await attach('optic', cfg.optic, sk.rail_start.parent, railPos);
  if (optic) {
    out.optic = optic;
    const od = Armory.att(cfg.optic)?.optic || {};
    let sight = optic.getObjectByName('sight') || optic.getObjectByName('eye');
    if (!sight) {
      // sight axis = sightHeight above the mount; eye end = the ocular (PIP lens) or the rear lens
      const eyeEnd = optic.getObjectByName(od.pipNode || 'lens_pip') || optic.getObjectByName('lens_rear') || optic.getObjectByName('lens_front');
      optic.updateWorldMatrix(true, true); const bb = new THREE.Box3().setFromObject(eyeEnd || optic);
      const inv = new THREE.Matrix4().copy(optic.matrixWorld).invert(); bb.applyMatrix4(inv);
      const y = od.sightHeight ?? (bb.min.y + bb.max.y) / 2;
      sight = socket(optic, 'sight', [0, y, eyeEnd ? (bb.min.z + bb.max.z) / 2 : bb.min.z]);
    }
    out.sight = { obj: sight, front: null, iron: false };
    const reticleMesh = optic.getObjectByName('reticle'); if (reticleMesh && reticleMesh.isMesh) reticleMesh.visible = false;   // drawn collimated by the lens shader
    out.lens = optic.getObjectByName(od.pip ? (od.pipNode || 'lens_pip') : 'lens_rear') || optic.getObjectByName('lens_dot') || optic.getObjectByName('lens_holo') || optic.getObjectByName('lens') || optic.getObjectByName('lens_front');
    out.opticColor = od.color || null;
    if (out.lens && !out.lens.isMesh) { let f = null; out.lens.traverse(m => { if (!f && m.isMesh) f = m; }); out.lens = f || null; }
    // fold the front iron sight when an optic is fitted (flip-up sights)
    for (const [n, dir] of [['sight_rear', -1], ['sight_front', 1]]) { const o = root.getObjectByName(n); if (o) o.rotation.x = dir * Math.PI / 2; }
  }
  else if (def.class !== 'pistol') buildIrons(out, root, sk, Armory.att(cfg.optic)?.optic?.irons || 'aperture', M, rs);
  const muzzle = await attach('muzzle', cfg.muzzle, sk.muzzle.parent, sk.muzzle.position);
  if (muzzle) {
    let mz = muzzle.getObjectByName('muzzle') || muzzle.getObjectByName('socket_muzzle');
    if (!mz) { const bb = new THREE.Box3(); muzzle.updateWorldMatrix(true, true); const inv = new THREE.Matrix4().copy(muzzle.matrixWorld).invert(); bb.setFromObject(muzzle).applyMatrix4(inv); mz = socket(muzzle, 'muzzle', [0, 0, bb.max.z]); }
    out.muzzle = mz;
  }
  const laserParent = sk.side_rail || sk.under_rail;
  const laser = cfg.laser && laserParent ? await attach('laser', cfg.laser, laserParent.parent, laserParent.position) : null;
  if (laser && laser.name === 'att:laser' && Armory.att(cfg.laser)?.file) {
    // armory laser modules are authored for a top rail (box above the mount, +Y up); turn the module so
    // its top faces outward from the bore at whichever rail it sits on (side rail -> on its side, under -> upside down)
    const bore = sk.muzzle?.position || new THREE.Vector3(), lp = laserParent.position;
    const ox = lp.x - bore.x, oy = lp.y - bore.y;
    if (Math.hypot(ox, oy) > 0.005) laser.rotation.z = Math.atan2(-ox, oy);
  }
  if (laser) {
    const ld = Armory.att(cfg.laser)?.laser || {};
    out.laser = laser.getObjectByName(ld.emitter || 'emitter') || laser.getObjectByName('laser') || laser;
    // the emitter lens glows in the chosen laser colour (own material so colours never leak between guns)
    let lens = laser.getObjectByName(ld.lens || 'laser_lens'); if (lens && !lens.isMesh) { let f = null; lens.traverse(m => { if (!f && m.isMesh) f = m; }); lens = f; }
    if (lens) { lens.material = new THREE.MeshBasicMaterial({ color: cfg.laserColor || ld.color || '#ff2020', toneMapped: false }); out.laserLens = lens; }
  }
  // the support hand's baked pose holds the handguard at grip_L, so foregrips mount just ahead of the
  // hand (hand-stop position) instead of inside the palm; never past the end of the handguard
  let underPos = sk.under_rail?.position;
  if (underPos && def.file && sk.grip_L && def.class !== 'pistol') {
    const zEnd = (sk.iron_front?.position.z ?? underPos.z + 0.1) - 0.005;
    underPos = underPos.clone(); underPos.z = Math.min(zEnd, Math.max(underPos.z, sk.grip_L.position.z + 0.07));
  }
  const under = sk.under_rail ? await attach('underbarrel', cfg.underbarrel, sk.under_rail.parent, underPos) : null;
  // armory foregrips are authored grip-up (top-rail convention): turn them to hang under the handguard
  if (under && Armory.att(cfg.underbarrel)?.file && (def.socketUp?.under_rail?.[1] ?? -1) < 0) under.rotation.z = Math.PI;
  if (under) { const gl = under.getObjectByName('grip_L'); if (gl) out.gripL = gl; }
  // magazine / stock variants: scale the placeholder parts (real files replace them)
  const magA = Armory.att(cfg.mag), stockA = Armory.att(cfg.stock);
  if (out.mag && magA?.id === 'ext_mag' && !magA.file) out.mag.scale.y = 1.35;
  if (magA?.file && out.mag) { const m2 = await attach('mag', cfg.mag, out.mag.parent, out.mag.position); if (m2) { out.mag.visible = false; out.mag = m2; } }
  const stock = root.getObjectByName('stock') || root.getObjectByName('stock_default');
  if (stock && stockA && !stockA.file) { if (stockA.id === 'heavy_stock') stock.scale.set(1.25, 1.1, 1.05); if (stockA.id === 'light_stock') stock.scale.set(0.7, 0.75, 1); }
  if (stockA?.file && stock) { const s2 = await attach('stock', cfg.stock, stock.parent, stock.position); if (s2) stock.visible = false; }
  holder.updateMatrixWorld(true);
  return out;
}
// Clean iron sights: the armory's blocky flip-ups fold away and a thin rear ring (aperture or ghost ring)
// plus a slim front post with protective ears stand on the sight line (iron_rear -> iron_front), so the
// post sits dead centre in the ring and the picture around it stays open. The post tip has a tritium dot.
function buildIrons(out, root, sk, kind, M, rs) {
  for (const n of ['sight_rear', 'sight_front']) { const o = root.getObjectByName(n); if (o) o.visible = false; }
  const railY = rs.start[1], ghost = kind === 'ghost';
  const R = ghost ? 0.0042 : 0.0024, T = ghost ? 0.00055 : 0.0009;
  const rp = sk.iron_rear.position, fp = sk.iron_front.position;
  const rear = group('irons_rear'); rear.position.copy(rp); sk.iron_rear.parent.add(rear);
  const stemH = Math.max(0.002, rp.y - R - railY);
  rear.add(mesh([new THREE.TorusGeometry(R, T, 8, 40), at(rb(0.0035, stemH, 0.006, 0.0008), 0, -R - stemH / 2, 0), at(rb(0.012, 0.004, 0.012, 0.001), 0, -R - stemH, 0)], M.steel, 'irons'));
  const front = group('irons_front'); front.position.copy(fp); sk.iron_front.parent.add(front);
  const fh = Math.max(0.004, fp.y - railY), pw = ghost ? 0.0011 : 0.0014;
  front.add(mesh([at(rb(pw, 0.011, 0.0018, 0.0003), 0, -0.0055, 0), at(rb(0.0045, fh - 0.009, 0.006, 0.0008), 0, -0.011 - (fh - 0.011) / 2 + 0.001, 0),
    at(rb(0.0012, 0.012, 0.004, 0.0004), 0.0065, -0.006, 0), at(rb(0.0012, 0.012, 0.004, 0.0004), -0.0065, -0.006, 0), at(rb(0.015, 0.0035, 0.008, 0.001), 0, -fh, 0)], M.steel, 'irons'));
  const dot = new THREE.Mesh(new THREE.SphereGeometry(0.0006, 8, 6), new THREE.MeshBasicMaterial({ color: 0x9dff5a, toneMapped: false })); dot.position.set(0, -0.0003, -0.001); front.add(dot);
}
async function gltfSafe(url) { try { return await gltf(url); } catch (e) { console.warn('[armory] could not load', url); return null; } }
// Real armory guns: one PBR atlas per gun plus <gun>_mask.png (R = paintable furniture). The camo is
// projected triplanar in the gun's own space (so the pattern scale is real metres and seams never
// show) and blended into the albedo where the mask is white; solid finishes tint the same area.
const _texCache = new Map();
function camoTex(file, srgb = true) {
  if (!_texCache.has(file)) { const t = new THREE.TextureLoader().load(assetUrl(file)); t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 8; t.flipY = false; _texCache.set(file, t); }
  return _texCache.get(file);
}
export function applyCamo(root, camo, def) {
  if (!camo) return;
  const maskFile = def?.textures?.camoMask;
  if (maskFile) {
    if (camo.id === 'black' && !camo.texture) return;     // the atlas is authored black: nothing to do
    const mask = camoTex(maskFile, false);
    const pat = camo.texture ? camoTex(camo.texture) : null;
    const col = new THREE.Color(camo.color || '#1b1c1d');
    root.traverse(o => {
      if (!o.isMesh || !o.material || !o.material.map) return;
      const m = o.material.clone();
      m.onBeforeCompile = sh => {
        sh.uniforms.tMask = { value: mask }; sh.uniforms.tCamo = { value: pat }; sh.uniforms.uCamoCol = { value: col };
        sh.uniforms.uCamoScale = { value: 1 / (camo.scale || 0.12) }; sh.uniforms.uHasPat = { value: pat ? 1 : 0 };
        sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vCamoP; varying vec3 vCamoN;')
          .replace('#include <begin_vertex>', '#include <begin_vertex>\nvCamoP = position; vCamoN = normal;');
        sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec3 vCamoP; varying vec3 vCamoN; uniform sampler2D tMask, tCamo; uniform vec3 uCamoCol; uniform float uCamoScale, uHasPat;')
          .replace('#include <map_fragment>', `#include <map_fragment>
          {
            float paint = texture2D(tMask, vMapUv).r;
            vec3 c = uCamoCol;
            if (uHasPat > 0.5) {
              vec3 w = pow(abs(normalize(vCamoN)), vec3(4.0)); w /= (w.x + w.y + w.z);
              vec3 P = vCamoP * uCamoScale;
              c = texture2D(tCamo, P.zy).rgb * w.x + texture2D(tCamo, P.xz).rgb * w.y + texture2D(tCamo, P.xy).rgb * w.z;
            }
            // keep the atlas' grime / edge wear: modulate by its luminance relative to the black base
            float lum = dot(diffuseColor.rgb, vec3(0.299, 0.587, 0.114));
            vec3 painted = c * clamp(0.75 + lum * 2.5, 0.6, 1.4);
            diffuseColor.rgb = mix(diffuseColor.rgb, painted, paint);
          }`);
      };
      m.customProgramCacheKey = () => 'camo' + (pat ? 1 : 0);
      if (camo.roughness != null && m.roughnessMap == null) m.roughness = camo.roughness;
      m.needsUpdate = true; o.material = m;
    });
    return;
  }
  root.traverse(o => {
    if (!o.isMesh || !o.material) return;
    const mats = Array.isArray(o.material) ? o.material : [o.material];
    o.material = mats.map(m => {
      if (!(m.userData.paint || /paint|camo|furniture|polymer|stock|handguard|body/i.test(m.name || ''))) return m;
      const c = m.clone();
      if (camo.pattern) { c.map = patternTexture(camo.color, camo.pattern); c.color.set(0xffffff); } else if (camo.color) { c.color.set(camo.color); }
      c.needsUpdate = true; return c;
    });
    if (o.material.length === 1) o.material = o.material[0];
  });
}
