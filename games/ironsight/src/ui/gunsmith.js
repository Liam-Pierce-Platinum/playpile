// GUNSMITH: the configured weapon on a workbench under studio light. Slide the optic along the
// rail, swap muzzle devices (stats change), laser module + colour picker + toggle, underbarrel,
// magazine, stock, camo, gloves and sleeves. Stat bars update live against the gun's baseline.
// Loadout = primary + secondary + lethal + tactical. Everything persists in localStorage (try/catch):
// the current build, every gun's last build (switching guns restores it) and up to 6 named presets.
// Every edit saves at once.
import * as THREE from 'three';
import { Armory, buildWeapon, computeStats, defaultConfig, validateConfig } from '../game/manifest.js';
import { pbr } from '../core/assets.js';
import { THROWABLES } from '../game/grenades.js';

const $ = id => document.getElementById(id);
const KEY = 'ironsight.loadouts.v1';

export function loadLoadouts() {
  let v = null;
  try { v = JSON.parse(localStorage.getItem(KEY) || 'null'); } catch (e) { v = null; }
  const d = { primary: defaultConfig('m4'), secondary: defaultConfig('p226'), lethal: 'frag', tactical: 'flash', perGun: {}, presets: [] };
  if (!v) return d;
  const ok = (x, kind) => THROWABLES[x]?.kind === kind;
  return { primary: validateConfig(v.primary || d.primary), secondary: validateConfig(v.secondary || d.secondary), lethal: ok(v.lethal, 'lethal') ? v.lethal : 'frag', tactical: ok(v.tactical, 'tactical') ? v.tactical : 'flash',
    perGun: v.perGun || {}, presets: (v.presets || []).filter(Boolean).map(p => ({ ...p, primary: validateConfig(p.primary || d.primary), secondary: validateConfig(p.secondary || d.secondary) })) };
}
export function saveLoadouts(l) { try { localStorage.setItem(KEY, JSON.stringify(l)); return true; } catch (e) { return false; } }

const STATS = [
  ['Damage', s => s.damage * s.pellets, 0, 200], ['Fire rate', s => s.rpm, 0, 1000], ['Range', s => s.range, 0, 400],
  ['Muzzle velocity', s => s.velocity, 300, 950], ['Recoil control', s => 1 / (s.recoilV + s.recoilH * 0.7), 0, 4],
  ['Hip accuracy', s => 1 / s.hip, 0, 0.8], ['Aim speed', s => 1 / s.adsTime, 2, 9], ['Mobility', s => s.move, 0.6, 1.0],
  ['Magazine', s => s.mag, 0, 50], ['Reload speed', s => 1 / s.reload, 0.2, 2],
];

export class Gunsmith {
  constructor(game) {
    this.game = game;
    this.scene = new THREE.Scene();
    this.cam = new THREE.PerspectiveCamera(30, 1, 0.01, 50);
    this.yaw = -0.6; this.pitch = 0.18; this.dist = 1.95;
    this.loadouts = loadLoadouts();
    this.slot = 'primary';
    this.weapon = null;
    this.built = false;
    this.busy = 0;
    this.bindUI();
  }
  async setup() {
    if (this.built) return;
    this.built = true;
    const S = this.scene;
    const key = new THREE.SpotLight(0xfff3e4, 40, 10, 0.5, 0.6, 2); key.position.set(1.4, 2.2, 1.2); key.castShadow = true; key.shadow.mapSize.set(2048, 2048); key.shadow.bias = -0.0002;
    const rim = new THREE.SpotLight(0x9ec2ff, 25, 10, 0.6, 0.7, 2); rim.position.set(-1.6, 1.4, -1.6);
    const fill = new THREE.HemisphereLight(0xdde6f0, 0x2a2420, 0.35);
    S.add(key, key.target, rim, rim.target, fill);
    // bench
    const top = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.06, 1.1), pbr('weathered_planks', { roughness: 0.9 }));
    top.position.y = -0.18; top.receiveShadow = true; S.add(top);
    const mat = new THREE.Mesh(new THREE.PlaneGeometry(1.4, 0.7), new THREE.MeshStandardMaterial({ color: 0x1d2a22, roughness: 0.95 }));
    mat.rotation.x = -Math.PI / 2; mat.position.y = -0.149; mat.receiveShadow = true; S.add(mat);
    const wall = new THREE.Mesh(new THREE.PlaneGeometry(8, 4), pbr('concrete_wall_006', { roughness: 1 }));
    wall.position.set(0, 0.8, -1.2); wall.receiveShadow = true; S.add(wall);
    S.background = new THREE.Color(0x0b0d0f);
    this.pivot = new THREE.Group(); S.add(this.pivot);
    // drag to orbit
    const cv = this.game.renderer.domElement;
    let drag = false, lx = 0, ly = 0;
    cv.addEventListener('pointerdown', e => { if (this.game.state !== 'gunsmith') return; drag = true; lx = e.clientX; ly = e.clientY; });
    addEventListener('pointerup', () => drag = false);
    addEventListener('pointermove', e => { if (!drag || this.game.state !== 'gunsmith') return; this.yaw -= (e.clientX - lx) * 0.006; this.pitch = THREE.MathUtils.clamp(this.pitch + (e.clientY - ly) * 0.004, -0.5, 0.9); lx = e.clientX; ly = e.clientY; });
    cv.addEventListener('wheel', e => { if (this.game.state !== 'gunsmith') return; this.dist = THREE.MathUtils.clamp(this.dist * (1 + Math.sign(e.deltaY) * 0.08), 0.6, 3); }, { passive: true });
  }
  get cfg() { return this.loadouts[this.slot]; }
  set cfg(v) { this.loadouts[this.slot] = v; if (v?.gun) this.loadouts.perGun[v.gun] = v; this.save(); }
  bindUI() {
    const on = (id, ev, fn) => $(id).addEventListener(ev, fn);
    on('gsSlot', 'change', () => { this.slot = $('gsSlot').value === '1' ? 'secondary' : 'primary'; this.fill(); this.rebuild(); });
    on('gsGun', 'change', () => { const id = $('gsGun').value; this.cfg = validateConfig(this.loadouts.perGun[id] || defaultConfig(id)); this.fill(); this.rebuild(); });
    on('gsLethal', 'change', () => { this.loadouts.lethal = $('gsLethal').value; this.save(); });
    on('gsTactical', 'change', () => { this.loadouts.tactical = $('gsTactical').value; this.save(); });
    on('gsPresetSave', 'click', () => {
      const L = this.loadouts, name = ($('gsPresetName').value || '').trim().slice(0, 24) || 'Preset ' + (L.presets.length + 1);
      const p = { name, primary: { ...L.primary }, secondary: { ...L.secondary }, lethal: L.lethal, tactical: L.tactical };
      const i = L.presets.findIndex(x => x.name === name); if (i >= 0) L.presets[i] = p; else { L.presets.push(p); if (L.presets.length > 6) L.presets.shift(); }
      this.save(); this.fillPresets(); $('gsPreset').value = String(L.presets.findIndex(x => x.name === name));
    });
    on('gsPresetLoad', 'click', () => { const p = this.loadouts.presets[+$('gsPreset').value]; if (!p) return; Object.assign(this.loadouts, { primary: validateConfig(p.primary), secondary: validateConfig(p.secondary), lethal: p.lethal, tactical: p.tactical }); this.save(); this.fill(); this.rebuild(); });
    on('gsPresetDel', 'click', () => { const i = +$('gsPreset').value; if (!this.loadouts.presets[i]) return; this.loadouts.presets.splice(i, 1); this.save(); this.fillPresets(); });
    for (const [id, k] of [['gsOptic', 'optic'], ['gsMuzzle', 'muzzle'], ['gsLaser', 'laser'], ['gsUnder', 'underbarrel'], ['gsMag', 'mag'], ['gsStock', 'stock'], ['gsCamo', 'camo'], ['gsGlove', 'glove'], ['gsSleeve', 'sleeve']]) on(id, 'change', () => { this.cfg = { ...this.cfg, [k]: $(id).value }; this.rebuild(); });
    on('gsRail', 'input', () => { this.cfg = { ...this.cfg, rail: +$('gsRail').value }; this.placeOptic(); this.stats(); $('gsRailV').textContent = this.railText(); });
    on('gsRail', 'change', () => this.rebuild());
    on('gsLaserCol', 'input', () => { this.cfg = { ...this.cfg, laserColor: $('gsLaserCol').value }; this.laserPreview(); if (this.weapon?.laserLens) this.weapon.laserLens.material.color.set(this.cfg.laserColor); });
    on('gsLaserOn', 'change', () => { this.cfg = { ...this.cfg, laserOn: $('gsLaserOn').checked }; this.laserPreview(); });
  }
  railText() {
    const w = this.weapon; if (!w) return '';
    const a = w.sockets.rail_start.position, b = w.sockets.rail_end.position;
    const z = a.z + (b.z - a.z) * this.cfg.rail;
    const o = Armory.att(this.cfg.optic)?.optic;
    let eye = '';
    if (o && o.reticle !== 'iron') {
      const relief = Math.max(0.045, o.eyeRelief + (this.cfg.rail - 0.5) * a.distanceTo(b)), err = relief - o.eyeRelief;
      eye = ` · eye ${(relief * 100).toFixed(0)} cm` + (o.zoom >= 2 ? (Math.abs(err) <= 0.025 ? ' (in eye box)' : err > 0 ? ' (too far: scope shadow)' : ' (too close: scope shadow)') : '');
    }
    return `${(this.cfg.rail * 100).toFixed(0)}% · ${(z * 100).toFixed(1)} cm from grip${eye}`;
  }
  fill() {
    const A = Armory, c = validateConfig(this.cfg); this.cfg = c;
    const opt = (sel, list, val) => { $(sel).innerHTML = list.map(x => `<option value="${x.id}" ${x.id === val ? 'selected' : ''}>${x.name}</option>`).join(''); };
    const guns = A.m.guns.filter(g => this.slot === 'secondary' ? g.class === 'pistol' || true : true);
    opt('gsGun', guns, c.gun);
    const g = A.gun(c.gun);
    opt('gsOptic', A.slotList(g, 'optic'), c.optic); opt('gsMuzzle', A.slotList(g, 'muzzle'), c.muzzle); opt('gsLaser', A.slotList(g, 'laser'), c.laser);
    opt('gsUnder', A.slotList(g, 'underbarrel'), c.underbarrel); opt('gsMag', A.slotList(g, 'mag'), c.mag); opt('gsStock', A.slotList(g, 'stock'), c.stock);
    opt('gsCamo', A.m.camos, c.camo); opt('gsGlove', A.m.gloves, c.glove); opt('gsSleeve', A.m.sleeves, c.sleeve);
    $('gsRail').value = c.rail; $('gsLaserCol').value = c.laserColor; $('gsLaserOn').checked = c.laserOn !== false;
    $('gsName').textContent = g.name;
    const th = kind => Object.entries(THROWABLES).filter(([, t]) => t.kind === kind).map(([id, t]) => ({ id, name: t.name }));
    opt('gsLethal', th('lethal'), this.loadouts.lethal); opt('gsTactical', th('tactical'), this.loadouts.tactical);
    this.fillPresets();
  }
  fillPresets() { const P = this.loadouts.presets; $('gsPreset').innerHTML = P.length ? P.map((p, i) => `<option value="${i}">${String(p.name).replace(/[<&]/g, '')}</option>`).join('') : '<option value="">No presets yet</option>'; }
  async open() {
    await this.setup();
    await Armory.refresh();
    $('gsSlot').value = this.slot === 'secondary' ? '1' : '0';
    this.fill();
    await this.rebuild();
  }
  async rebuild() {
    const id = ++this.busy;
    this.cfg = validateConfig(this.cfg);
    const w = await buildWeapon(this.cfg);
    if (id !== this.busy) return;
    if (this.weapon) this.pivot.remove(this.weapon.root);
    this.weapon = w;
    w.root.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
    // centre the gun on the bench
    const bb = new THREE.Box3().setFromObject(w.root); const c = bb.getCenter(new THREE.Vector3());
    w.root.position.sub(c); w.root.position.y += -0.1 - (bb.min.y - c.y);
    this.pivot.add(w.root);
    // laser preview dot/beam
    if (this.beam) { this.beam.parent?.remove(this.beam); this.beam = null; }
    if (w.laser) {
      this.beam = new THREE.Mesh(new THREE.CylinderGeometry(0.0015, 0.0015, 2.5, 6).translate(0, 1.25, 0).rotateX(Math.PI / 2), new THREE.MeshBasicMaterial({ color: this.cfg.laserColor, transparent: true, opacity: 0.6, blending: THREE.AdditiveBlending, toneMapped: false }));
      w.laser.add(this.beam);
    }
    this.laserPreview();
    $('gsName').textContent = Armory.gun(this.cfg.gun).name;
    $('gsRailV').textContent = this.railText();
    this.stats();
  }
  placeOptic() {
    const w = this.weapon; if (!w || !w.optic) return;
    w.optic.position.lerpVectors(w.sockets.rail_start.position, w.sockets.rail_end.position, this.cfg.rail);
  }
  laserPreview() { if (this.beam) { this.beam.material.color.set(this.cfg.laserColor); this.beam.visible = this.cfg.laserOn !== false; } }
  stats() {
    const st = computeStats(this.cfg), base = computeStats(defaultConfig(this.cfg.gun));
    $('gsStats').innerHTML = STATS.map(([n, f, lo, hi]) => {
      const v = (f(st) - lo) / (hi - lo), b = (f(base) - lo) / (hi - lo);
      const cv = Math.max(0, Math.min(1, v)), cb = Math.max(0, Math.min(1, b));
      const lowV = Math.min(cv, cb), diff = Math.abs(cv - cb);
      const cls = cv > cb + 0.001 ? 'up' : cv < cb - 0.001 ? 'down' : '';
      return `<div class="st">${n}<div><i style="width:${lowV * 100}%"></i>${cls ? `<s class="${cls}" style="left:${lowV * 100}%;width:${diff * 100}%"></s>` : ''}</div></div>`;
    }).join('') + `<div class="st" style="margin-top:12px">${st.optic.zoom > 1.2 ? st.optic.zoom.toFixed(1) + 'x optic · ' : ''}${st.suppressed ? 'suppressed · ' : ''}zero ${st.zero} m</div>`;
  }
  save() { saveLoadouts(this.loadouts); }
  render(renderer, dt) {
    const t = performance.now() * 0.001;
    if (this.weapon) this.pivot.rotation.y += dt * 0.0;
    const c = this.cam;
    c.aspect = innerWidth / innerHeight; c.updateProjectionMatrix();
    // keep the gun right of the panel
    c.position.set(Math.sin(this.yaw) * Math.cos(this.pitch) * this.dist, Math.sin(this.pitch) * this.dist, Math.cos(this.yaw) * Math.cos(this.pitch) * this.dist);
    c.lookAt(0, -0.05, 0);
    c.setViewOffset(innerWidth, innerHeight, -innerWidth * 0.015, -innerHeight * 0.06, innerWidth, innerHeight);   // between the option panel and the stats
    renderer.setRenderTarget(null);
    renderer.render(this.scene, c);
  }
}
