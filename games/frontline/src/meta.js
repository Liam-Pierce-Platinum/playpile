// Persistent progression: credits, XP/rank, owned guns + attachments, loadout, settings.
// Stored under localStorage 'pd.frontline'; every access is wrapped in try/catch.
import { WEAPONS, ATTACH, GRENADES } from './weapons.js';

const KEY = 'pd.frontline';
export const RANKS = ['Recruit', 'Private', 'Private I', 'Corporal', 'Sergeant', 'Staff Sergeant', 'Master Sergeant', 'Lieutenant', 'Captain', 'Major', 'Colonel', 'General'];

function fresh() {
  return {
    v: 1, credits: 600, xp: 0,
    owned: { ar: [], pistol: [], knife: [] }, // weapon id -> owned attachments
    grenades: ['frag'],
    loadout: { primary: { id: 'ar', att: [] }, secondary: { id: 'pistol', att: [] }, grenade: 'frag' },
    settings: { sens: 1.0, difficulty: 'regular', muted: false, fov: 78, map: 'ashfall', invert: false },
    stats: { matches: 0, wins: 0, kills: 0, deaths: 0, waveBest: 0 },
  };
}

export class Meta {
  constructor() { this.d = fresh(); this.load(); }
  load() {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) {
        const d = JSON.parse(raw);
        const f = fresh();
        this.d = { ...f, ...d, settings: { ...f.settings, ...(d.settings || {}) }, stats: { ...f.stats, ...(d.stats || {}) }, owned: { ...f.owned, ...(d.owned || {}) } };
      }
    } catch (e) { this.d = fresh(); }
  }
  save() { try { localStorage.setItem(KEY, JSON.stringify(this.d)); } catch (e) { /* storage blocked */ } }
  rank() {
    let xp = this.d.xp, lvl = 0, need = 800;
    while (xp >= need && lvl < RANKS.length - 1) { xp -= need; lvl++; need = Math.round(need * 1.35); }
    return { lvl, name: RANKS[lvl], into: xp, need };
  }
  owns(id) { return !!this.d.owned[id]; }
  ownsAtt(id, a) { return (this.d.owned[id] || []).includes(a); }
  buyWeapon(id) {
    const w = WEAPONS[id];
    if (this.owns(id) || this.d.credits < w.price) return false;
    this.d.credits -= w.price; this.d.owned[id] = []; this.save(); return true;
  }
  buyAtt(id, a) {
    if (!this.owns(id) || this.ownsAtt(id, a) || this.d.credits < ATTACH[a].price) return false;
    this.d.credits -= ATTACH[a].price; this.d.owned[id].push(a); this.save(); return true;
  }
  buyGrenade(g) {
    if (this.d.grenades.includes(g) || this.d.credits < GRENADES[g].price) return false;
    this.d.credits -= GRENADES[g].price; this.d.grenades.push(g); this.save(); return true;
  }
  equip(slot, id) {
    if (!this.owns(id)) return;
    const cur = this.d.loadout[slot];
    this.d.loadout[slot] = { id, att: cur && cur.id === id ? cur.att : (this.d.equippedAtt?.[id] || []) };
    this.save();
  }
  toggleAtt(slot, a) {
    const l = this.d.loadout[slot];
    if (!this.ownsAtt(l.id, a)) return;
    const i = l.att.indexOf(a);
    if (i >= 0) l.att.splice(i, 1); else l.att.push(a);
    this.d.equippedAtt = this.d.equippedAtt || {};
    this.d.equippedAtt[l.id] = l.att.slice();
    this.save();
  }
  loadout() {
    const l = this.d.loadout;
    return { primary: { id: l.primary.id, att: l.primary.att.slice() }, secondary: { id: l.secondary.id, att: l.secondary.att.slice() }, grenade: l.grenade };
  }
  addReward(r, won, mode, wave) {
    const before = this.rank().lvl;
    this.d.credits += r.credits; this.d.xp += r.xp;
    this.d.stats.matches++; if (won) this.d.stats.wins++;
    this.d.stats.kills += r.kills;
    if (mode === 'waves') this.d.stats.waveBest = Math.max(this.d.stats.waveBest, wave || 0);
    this.save();
    return this.rank().lvl > before;
  }
}
