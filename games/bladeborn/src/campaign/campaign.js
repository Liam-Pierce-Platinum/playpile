// Stage manager (G.campaign): loads and unloads the story-free stages, checkpoints and respawn, saves progress, runs the
// objectives HUD, hints, triggers and the level's per-frame logic. Levels are src/levels/<id>.js (see CAMPAIGN.md).
import * as THREE from 'three';
import { clearWorld, boxes } from '../world.js';
import { LevelKit } from './kit.js';
import { makeTraverse } from './traverse.js';
import { ventAction, ventDo } from './vents.js';
import { clearSubs, updateSubs } from './cutscene.js';
import { CHAPTERS, loadLevelModule, nextChapter, chapterIndex } from './registry.js';
import { saveProgress, loadProgress, unlock } from './save.js';

const $ = id => document.getElementById(id);

class ObjectiveHud {
  constructor() { this.items = new Map(); }
  el() { return $('obj'); }
  objective(id, text) {
    const root = this.el(); if (!root) return;
    let r = this.items.get(id);
    if (!r) { r = document.createElement('div'); r.className = 'o new'; root.appendChild(r); this.items.set(id, r); setTimeout(() => r.classList.remove('new'), 50); }
    r.textContent = text; r.classList.remove('done');
  }
  complete(id) { const r = this.items.get(id); if (!r) return; r.classList.add('done'); setTimeout(() => { r.remove(); this.items.delete(id); }, 2600); }
  clear() { for (const r of this.items.values()) r.remove(); this.items.clear(); }
}

export class Campaign {
  // hooks: { resetHero(x, y, z, yaw), onDeathScreen() }
  constructor(G, hooks) {
    this.G = G; this.hooks = hooks; this.hud = new ObjectiveHud(); this.L = null; this.id = null; this.cp = 'start'; this.loading = false;
    this.env0 = { bg: G.scene.background.getHex(), fogN: G.scene.fog.near, fogF: G.scene.fog.far, fogC: G.scene.fog.color.getHex(), hemi: G.hemi?.intensity, sun: G.sun?.intensity, exposure: G.renderer?.toneMappingExposure };
  }
  async load(id, cp = null) {
    if (this.loading) return; this.loading = true;
    const G = this.G; fade(1);
    await new Promise(r => setTimeout(r, 250));
    try {
      const mod = (await loadLevelModule(id)).default;
      this.unload();
      const L = new LevelKit(G, this, mod); this.L = L; this.id = id; this.def = mod;
      G.flags = L.flags; G.level = mod; G.mode = 'campaign';
      this.applyEnv(mod.env || {});
      const b = mod.bounds; G.inBounds = b ? p => p.x > b[0] && p.x < b[2] && p.z > b[1] && p.z < b[3] : null;
      mod.build(L);
      G.coverBoxes = [...new Set([...L.extraCover, ...boxes.filter(b => !b.tree && !b.branch && !b.glass && !b.grate && !b.door && b.max.y > 1.2 && b.max.y < 9 && (b.max.x - b.min.x) < 12 && (b.max.z - b.min.z) < 12 && !b.vent)])];
      this.untraverse = makeTraverse(L);
      const s = (cp && L.checkpoints[cp]) || L.checkpoints.start || { x: 0, y: 0, z: 0, yaw: 0, ...(mod.spawn || {}) };
      this.cp = cp && L.checkpoints[cp] ? cp : 'start';
      this.hooks.resetHero(s.x, s.y, s.z, s.yaw);
      G.respawn = [s.x, s.y, s.z];
      const prev = loadProgress() || {};
      saveProgress({ ...prev, level: id, checkpoint: this.cp, unlocked: [...new Set([...(prev.unlocked || []), id])] });
      const ch = CHAPTERS.find(c => c.id === id);
      if (ch && this.cp === 'start') card(ch.n, ch.title); else if (!ch) card('', mod.title || id);
      fade(0);
      this.loading = false;
      Promise.resolve().then(() => mod.start?.(L, { checkpoint: this.cp })).catch(err => console.warn('[level] start: ' + err.message));
    } catch (err) { console.warn('[campaign] load ' + id + ': ' + err.message); this.loading = false; fade(0); throw err; }
  }
  applyEnv(e) {
    const G = this.G, E = this.env0;
    G.scene.background.setHex(e.bg ?? E.bg); G.scene.fog.color.setHex(e.fog?.[2] ?? e.bg ?? E.fogC);
    G.scene.fog.near = e.fog?.[0] ?? E.fogN; G.scene.fog.far = e.fog?.[1] ?? E.fogF;
    if (G.hemi) G.hemi.intensity = e.hemi ?? E.hemi; if (G.sun) G.sun.intensity = e.sun ?? E.sun;
    if (G.renderer) G.renderer.toneMappingExposure = e.exposure ?? E.exposure;
  }
  unload() {
    const G = this.G; if (G.cut) G.cut.stop(true);
    if (this.L) { try { this.def.unload?.(this.L); } catch (_) {} this.L.dispose(); }
    this.untraverse?.(); this.untraverse = null; this.L = null;
    for (const e of G.enemies) { G.scene.remove(e.rig.root); e.rig.skin?.dispose(); if (e.laser) G.scene.remove(e.laser); }
    G.enemies.length = 0; G.meleeToken = G.shotToken = null;
    for (const p of G.projectiles) G.scene.remove(p.m); G.projectiles.length = 0;
    for (const r of G.ragdolls) r.dispose(); G.ragdolls.length = 0;
    for (const p of G.parts) p.dispose(); G.parts.length = 0;
    for (const r of G.pinned || []) { G.scene.remove(r.root); r.skin?.dispose(); } G.pinned = []; G.slumps = [];
    G.fx.clear(); clearWorld(); clearSubs(); this.hud.clear();
    G.camOverride = null; G.flags = {}; G.inBounds = null; G.hintOverride = null;
  }
  update(dt) {
    const G = this.G, L = this.L; if (!L) return;
    L.update(dt);
    const h = G.hero, a = !G.cut && ventAction(L, h);
    let hint = a ? a.label : null;
    if (!hint && h.ladder) hint = 'W / S  climb  ·  SPACE  jump off';
    else if (!hint && h.crawling) hint = 'WASD  crawl  ·  SHIFT  faster';
    G.hintOverride = hint;
  }
  realUpdate(rdt) { updateSubs(this.G, rdt); }
  // E / Space in a level: vents first; true = used
  key(k) { const L = this.L; if (!L || this.G.cut) return false; return ventDo(L, this.G.hero, k); }
  reachCheckpoint(id) {
    if (this.cp === id) return; this.cp = id; const c = this.L.checkpoints[id]; this.G.respawn = [c.x, c.y, c.z];
    const p = loadProgress() || {}; saveProgress({ ...p, level: this.id, checkpoint: id }); this.G.banner?.('CHECKPOINT', 1.2);
  }
  retry() { return this.load(this.id, this.cp); }
  // a stage is cleared: mark it, show the result, back to the menu (stages never chain into each other)
  finish() {
    const G = this.G, id = this.id;
    const p = loadProgress() || {}; p.done = [...new Set([...(p.done || []), id])]; saveProgress(p);
    G.banner?.('STAGE CLEAR', 3);
    setTimeout(() => this.hooks.onClear?.(), 3200);
  }
}

function fade(on) { const f = $('fade'); if (f) f.style.opacity = on ? 1 : 0; }
function card(n, title) {
  const c = $('card'); if (!c) return;
  c.innerHTML = (n ? `<i>STAGE ${n}</i>` : '') + `<b>${title}</b>`; c.style.opacity = 1;
  clearTimeout(card.t); card.t = setTimeout(() => { c.style.opacity = 0; }, 3200);
}
export { unlock };
