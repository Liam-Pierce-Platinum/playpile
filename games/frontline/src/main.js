// FRONTLINE entry: boot, main loop, player controller, cameras, menus <-> matches.
// URL: ?play=1 (straight into Team Battle) · &mode=battle|waves|watch · &map=ashfall|dustline|greenwater
//      &diff=recruit|regular|veteran|elite · ?ai=1 AI debug overlay · ?bot=1 autopilot player
//      ?watch=1 spectate AI vs AI · ?lq=1 low quality · ?god=1 player takes no damage (tests)
import * as THREE from '../vendor/three.module.js';
import { Renderer } from './render.js';
import { Audio } from './audio.js';
import { Meta } from './meta.js';
import { Input } from './input.js';
import { HUD } from './hud.js';
import { UI } from './ui.js';
import { ViewModel } from './viewmodel.js';
import { AIDebug } from './debug.js';
import { Match } from './match.js';
import { Brain, DIFF } from './ai.js';
import { MAPS } from './maps.js';
import { clamp, lerp, fwdX, fwdZ, DEG, yawTo } from './util.js';
import { WEAPONS } from './weapons.js';

const params = new URLSearchParams(location.search);
const $ = (id) => document.getElementById(id);

const G = window.__G = {
  state: 'boot', paused: false, match: null, backdrop: null,
  autopilot: params.has('bot'),
  ctl: { prompt: '', recoil: 0, deathT: 0, spawnChoice: 'base', giveUp: 0, follow: null, overview: false, endT: 0, land: 0 },
};

function boot() {
  const canvas = $('c');
  G.renderer = new Renderer(canvas, { lq: params.has('lq'), noShadows: params.has('noshadow') });
  G.audio = new Audio();
  G.meta = new Meta();
  G.input = new Input(canvas);
  G.hud = new HUD();
  G.ui = new UI(G);
  G.vm = new ViewModel(G.renderer);
  G.debug = new AIDebug(G.renderer.scene, $('labels'));
  G.audio.setMuted(G.meta.d.settings.muted);
  if (params.get('diff') && DIFF[params.get('diff')]) G.meta.d.settings.difficulty = params.get('diff');
  if (params.get('map') && MAPS.find((m) => m.id === params.get('map'))) G.meta.d.settings.map = params.get('map');
  G.hud.show(false);
  G.input.onLockChange = (locked) => {
    if (!locked && G.state === 'play' && !G.paused && G.match && G.match.phase !== 'ended' && G.match.mode !== 'watch') G.pause();
  };
  canvas.addEventListener('mousedown', () => {
    G.audio.init();
    if (G.state === 'play' && !G.input.locked && !G.paused && G.match && G.match.mode !== 'watch') G.input.lock();
  });
  addEventListener('keydown', () => G.audio.init(), { once: true });
  addEventListener('pointerdown', () => G.audio.init(), { once: true });
  const mode = params.get('mode') || (params.has('watch') ? 'watch' : 'battle');
  if (params.has('play') || params.has('watch')) G.startMatch(mode);
  else G.menu();
  if (params.get('ai') === '1') G.debug.set(true);
  last = performance.now();
  requestAnimationFrame(frame);
}

// ------------------------------------------------------------------------- flow
G.menu = function () {
  G.state = 'menu';
  G.paused = false;
  G.hud.show(false);
  G.menuBackdrop();
  G.ui.title();
};
G.menuBackdrop = function () {
  if (G.match) { G.match.dispose(); G.match = null; }
  if (G.backdrop) { G.backdrop.dispose(); G.backdrop = null; }
  const s = G.meta.d.settings;
  G.backdrop = new Match({ mode: 'watch', map: s.map, difficulty: 'regular', renderer: G.renderer, audio: G.audio, hud: G.hud, loadout: G.meta.loadout(), seed: 3 });
  G.backdrop.phase = 'live';
  G.renderer.vmScene.visible = false;
  G.renderer.camera.fov = 60; G.renderer.camera.updateProjectionMatrix();
};
G.startMatch = function (mode) {
  if (G.backdrop) { G.backdrop.dispose(); G.backdrop = null; }
  if (G.match) { G.match.dispose(); G.match = null; }
  G.debug.set(params.get('ai') === '1' || (mode === 'watch' && params.get('ai') !== '0') || G.debug.on);
  const s = G.meta.d.settings;
  const m = new Match({ mode, map: s.map, difficulty: s.difficulty, renderer: G.renderer, audio: G.audio, hud: G.hud, loadout: G.meta.loadout(), seed: (Date.now() & 0xffff), godMode: params.has('god'), roundTime: +params.get('time') || undefined });
  G.match = m;
  m.viewMuzzle = () => G.vm.muzzleWorld(G.renderer.camera, G._mz || (G._mz = new THREE.Vector3()));
  G.ui.hide();
  G.hud.tutorial = G.meta.d.stats.matches < 3 || params.has('tips');
  G.hud.reset(m); G.hud.show(true);
  G.state = 'play'; G.paused = false;
  document.body.classList.toggle('watching', mode === 'watch');
  const c = G.ctl;
  c.endT = 0; c.deathT = 0; c.giveUp = 0; c.spawnChoice = 'base'; c.follow = null; c.overview = false; c.recoil = 0;
  if (m.player) {
    G.vm.setWeapon(m.player.w, 0);
    G.renderer.vmScene.visible = true;
    if (G.autopilot) G.attachAutopilot();
    if (!G.input.isTouch) G.input.lock();
  } else {
    G.renderer.vmScene.visible = false;
    c.follow = m.soldiers.find((q) => q.brain) || null;
  }
  G.audio.init();
};
G.attachAutopilot = function () {
  const m = G.match;
  if (!m || !m.player) return;
  m.player.brain = new Brain(m.player, m, m.player.squad, DIFF.veteran);
  m.player.brain.onSpawn();
  G.autopilot = true;
};
G.pause = function () {
  if (G.state !== 'play') return;
  G.paused = true;
  G.input.unlock();
  G.ui.pause();
};
G.resume = function () {
  G.paused = false;
  G.ui.hide();
  if (G.match && G.match.mode !== 'watch') G.input.lock();
};
G.quit = function (silent) {
  G.input.unlock();
  if (G.match) { G.match.dispose(); G.match = null; }
  G.debug.set(params.get('ai') === '1');
  if (silent) { G.state = 'menu'; G.hud.show(false); G.menuBackdrop(); return; }
  G.menu();
};

// ------------------------------------------------------------------------- player control
const tmpV = new THREE.Vector3();
function playerControl(dt) {
  const m = G.match, p = m.player, I = G.input, it = p.intent, c = G.ctl;
  const S = G.meta.d.settings;
  c.prompt = '';
  if (I.hit('KeyM')) { S.muted = !S.muted; G.audio.setMuted(S.muted); G.meta.save(); }
  if (I.hit('F3')) G.debug.set(!G.debug.on);
  G.hud.board(m, I.down('Tab'));
  if (!p.alive) {
    it.fire = false; it.mx = it.mz = 0;
    if (m.mode === 'battle') {
      c.deathT = 6 - (m.time - (p.deathTime ?? m.time));
      for (let k = 1; k <= 4; k++) if (I.hit('Digit' + k)) { const o = m.respawnOptions(0)[k - 1]; if (o) { c.spawnChoice = o.id; document.querySelectorAll('#dead button').forEach((b) => b.classList.toggle('sel', b.dataset.s === o.id)); } }
      G.hud.setDeathCountdown(c.deathT);
      if (c.deathT <= 0 && m.phase === 'live') {
        m.respawn(p, c.spawnChoice);
        G.hud.hideDeath();
        G.vm.setWeapon(p.w, 0);
        if (p.brain) p.brain.onSpawn();
        c.recoil = 0;
      }
    }
    return;
  }
  if (p.brain && G.autopilot) { // autopilot: the AI brain drives the player (tests)
    return;
  }
  if (p.downed) {
    it.mx = it.mz = 0; it.fire = false;
    if (I.down('Space')) { c.giveUp += dt; if (c.giveUp > 1.2) { c.giveUp = 0; m.kill(p, p.lastAttacker, p.lastWeapon, false, true); } } else c.giveUp = 0;
    p.yaw -= I.mouse.dx * 0.0015; p.pitch = clamp(p.pitch - I.mouse.dy * 0.0015, -0.6, 0.6);
    it.yaw = p.yaw; it.pitch = p.pitch;
    return;
  }
  // look
  const s = p.w.s;
  const zoom = lerp(1, s.zoom, p.adsK);
  const sens = S.sens * 0.0022 / Math.pow(zoom, 0.85);
  p.yaw -= I.mouse.dx * sens;
  p.pitch = clamp(p.pitch - I.mouse.dy * sens * (S.invert ? -1 : 1), -1.45, 1.45);
  // recoil recovery: pull back part of the climb when not firing
  if (m.time - p.lastShot > 0.12 && c.recoil > 0) { const r = Math.min(c.recoil, dt * 6 * Math.max(0.02, c.recoil)); p.pitch -= r * 0.6; c.recoil -= r; }
  it.yaw = p.yaw; it.pitch = p.pitch;
  // move
  let f = 0, r = 0;
  if (I.down('KeyW') || I.down('ArrowUp')) f += 1;
  if (I.down('KeyS') || I.down('ArrowDown')) f -= 1;
  if (I.down('KeyD') || I.down('ArrowRight')) r += 1;
  if (I.down('KeyA') || I.down('ArrowLeft')) r -= 1;
  if (I.touch.moveId !== null) { f = -I.touch.mz; r = I.touch.mx; }
  const fx = fwdX(p.yaw), fz = fwdZ(p.yaw), rx = Math.cos(p.yaw), rz = -Math.sin(p.yaw);
  it.mx = fx * f + rx * r; it.mz = fz * f + rz * r;
  it.sprint = I.down('ShiftLeft') || I.down('ShiftRight');
  it.crouch = I.down('KeyC') || I.down('ControlLeft');
  it.jump = I.hit('Space');
  it.fire = I.mouse.left && m.phase === 'live';
  it.ads = I.mouse.right;
  if (I.hit('KeyR')) it.reload = true;
  if (I.hit('KeyG') && m.phase === 'live') it.grenade = true;
  if (I.hit('KeyV') && m.phase === 'live') it.melee = true;
  for (let k = 1; k <= 4; k++) if (I.hit('Digit' + k) && p.slots[k - 1]) it.slot = k - 1;
  if (I.mouse.wheel || I.hit('KeyQ')) {
    const dir = I.mouse.wheel < 0 ? -1 : 1;
    let n = p.cur;
    for (let k = 0; k < 4; k++) { n = (n + dir + 4) % 4; if (p.slots[n] && n !== 3) break; }
    it.slot = n;
  }
  // interactions
  const pk = m.nearestPickup(p);
  let mate = null;
  for (const o of m.soldiers) if (o !== p && o.team === p.team && o.alive && o.downed && Math.hypot(o.pos.x - p.pos.x, o.pos.z - p.pos.z) < 2.2) { mate = o; break; }
  const base = m.def.spawns[0][0];
  const crate = { x: -2.5, z: base.z - 6 * Math.sign(base.z) };
  const nearCrate = m.mode !== 'waves' ? Math.hypot(crate.x - p.pos.x, crate.z - p.pos.z) < 3 : Math.hypot(p.pos.x, p.pos.z - 30) < 3.5 && false;
  if (mate) {
    c.prompt = `HOLD E — REVIVE ${mate.name.toUpperCase()} ${mate.reviveProg ? Math.round(mate.reviveProg * 100) + '%' : ''}`;
    if (I.down('KeyE')) { m.reviveTick(p, mate, dt); it.mx = it.mz = 0; it.crouch = true; }
  } else if (pk) {
    const same = p.slots.some((sl) => sl && sl.id === pk.id);
    c.prompt = same ? `E — TAKE ${WEAPONS[pk.id].short} AMMO` : `E — PICK UP ${WEAPONS[pk.id].name}${pk.att.length ? ' (' + pk.att.join(', ') + ')' : ''}`;
    if (I.hit('KeyE')) { m.takePickup(p, pk); G.vm.setWeapon(p.w, 0); }
  } else if (nearCrate) {
    c.prompt = 'E — RESUPPLY AMMO & GRENADES';
    if (I.hit('KeyE')) { for (const sl of p.slots) if (sl && sl.s.mag) sl.reserve = sl.s.reserve; p.grenades = Math.max(p.grenades, 2); G.audio.swap(); m.events.push({ type: 'popup', text: 'RESUPPLIED' }); }
  }
}

G._playerControl = (dt) => playerControl(dt); // test hook (tools/duel.mjs)

// events that the controller cares about (recoil, weapon swaps, death)
function controllerEvents() {
  const m = G.match, p = m.player, c = G.ctl;
  for (const e of m.events) {
    if (e.type === 'shot' && p) {
      if (p.brain && G.autopilot) { p.brain.aimPitch += e.kv * 0.7; p.brain.aimYaw += e.kh * 0.7; }
      else { p.pitch = clamp(p.pitch + e.kv, -1.45, 1.45); p.yaw += e.kh; c.recoil += e.kv; }
      G.vm.shot(e.st);
      G.ctl.kickCam = Math.min(1, (G.ctl.kickCam || 0) + e.st.recoil.kick * 6);
    }
    if (e.type === 'switch' && p) G.vm.setWeapon(p.w, 0);
    if (e.type === 'died' && p && m.mode === 'battle') {
      c.deathT = 6; c.deathPos = p.pos.clone(); c.killer = e.killer;
      G.hud.showDeath(m, e, (ch) => { c.spawnChoice = ch; });
      c.spawnChoice = 'base';
    }
    if (e.type === 'spawn' && p) { G.vm.setWeapon(p.w, 0); }
  }
}

// ------------------------------------------------------------------------- cameras
let shakeT = 0;
function updateCamera(dt) {
  const m = G.match, cam = G.renderer.camera, c = G.ctl, S = G.meta.d.settings;
  cam.rotation.order = 'YXZ';
  if (G.camOverride) { const o = G.camOverride; cam.position.set(...o.pos); cam.lookAt(...o.look); if (o.fov && cam.fov !== o.fov) { cam.fov = o.fov; cam.updateProjectionMatrix(); } G.renderer.vmScene.visible = false; return; }
  shakeT += dt;
  const sh = m.fx.shake;
  const shx = sh * 0.025 * Math.sin(shakeT * 47), shy = sh * 0.025 * Math.cos(shakeT * 39);
  const p = m.player;
  if (p) {
    const s = p.w.s;
    const zoom = lerp(1, s.zoom, p.adsK);
    const fov = 2 * Math.atan(Math.tan(S.fov * DEG / 2) / zoom) / DEG;
    if (Math.abs(cam.fov - fov) > 0.01) { cam.fov = fov; cam.updateProjectionMatrix(); }
    c.kickCam = Math.max(0, (c.kickCam || 0) - dt * 8);
    if (p.alive && !p.downed) {
      p.eye(cam.position);
      // smooth step-ups
      c.camY = c.camY === undefined ? cam.position.y : lerp(c.camY, cam.position.y, Math.min(1, dt * 18));
      if (Math.abs(c.camY - cam.position.y) > 0.6) c.camY = cam.position.y;
      cam.position.y = c.camY;
      // head bob (subtle)
      const sp = p.onGround ? clamp(p.speedNow / 4.7, 0, 1.6) : 0;
      c.bobT = (c.bobT || 0) + dt * (5 + sp * 4) * (sp > 0.05 ? 1 : 0);
      cam.position.y += Math.sin(c.bobT * 2) * 0.03 * sp * (1 - p.adsK * 0.8);
      cam.rotation.set(p.pitch + shy + c.kickCam * 0.006, p.yaw + shx, Math.sin(c.bobT) * 0.004 * sp + (p.sprinting ? Math.sin(c.bobT) * 0.006 : 0));
    } else if (p.alive && p.downed) {
      cam.position.set(p.pos.x, p.pos.y + 0.45, p.pos.z);
      cam.rotation.set(p.pitch + 0.15, p.yaw, 0.35);
    } else {
      // death cam: rise above the body, look at it, then at the killer
      const dp = c.deathPos || p.pos;
      const t = 6 - c.deathT;
      const k = c.killer && c.killer.alive && t > 1.2 ? c.killer : null;
      const tx = k ? k.pos.x : dp.x, tz = k ? k.pos.z : dp.z, ty = k ? k.pos.y + 1.2 : dp.y + 0.4;
      const a = p.yaw + 0.8 + t * 0.12;
      cam.position.lerp(tmpV.set(dp.x + Math.sin(a) * 4, dp.y + 3.2, dp.z + Math.cos(a) * 4), Math.min(1, dt * 3));
      const dx = tx - cam.position.x, dy = ty - cam.position.y, dz = tz - cam.position.z;
      cam.rotation.set(Math.atan2(dy, Math.hypot(dx, dz)), yawTo(dx, dz), 0);
      if (cam.fov !== 60) { cam.fov = 60; cam.updateProjectionMatrix(); }
    }
    G.audio.listener.x = cam.position.x; G.audio.listener.y = cam.position.y; G.audio.listener.z = cam.position.z; G.audio.listener.yaw = cam.rotation.y;
    G.renderer.vmScene.visible = p.alive && !p.downed;
    return;
  }
  // spectator (watch mode)
  spectatorCam(dt, m, cam);
}
function spectatorCam(dt, m, cam) {
  const c = G.ctl, I = G.input;
  if (I.hit('Space') || I.hit('Mouse0') || I.hit('KeyN')) nextFollow(1);
  if (I.hit('KeyB')) nextFollow(-1);
  if (I.hit('KeyF')) c.overview = !c.overview;
  if (I.hit('F3')) G.debug.set(!G.debug.on);
  if (I.hit('KeyM')) { const S = G.meta.d.settings; S.muted = !S.muted; G.audio.setMuted(S.muted); }
  if ((I.hit('Escape') || I.hit('Pause')) && G.state === 'play') { G.quit(); return; }
  G.hud.board(m, I.down('Tab'));
  if (cam.fov !== 62) { cam.fov = 62; cam.updateProjectionMatrix(); }
  const f = c.follow;
  if (!c.overview && f) {
    if (!f.alive && (!c.followDeadT || m.time - c.followDeadT > 3)) { c.followDeadT = m.time; }
    if (!f.alive && m.time - c.followDeadT > 2.5) nextFollow(1);
    const yaw = f.yaw;
    const back = 3.6, side = 0.9, up = 1.9;
    const tx = f.pos.x - fwdX(yaw) * back + Math.cos(yaw) * side, tz = f.pos.z - fwdZ(yaw) * back - Math.sin(yaw) * side;
    let ty = f.pos.y + up;
    // keep the camera out of walls
    const W = m.world;
    const ex = f.pos.x, ey = f.pos.y + 1.6, ez = f.pos.z;
    const dx = tx - ex, dy = ty - ey, dz = tz - ez, L = Math.hypot(dx, dy, dz);
    const hit = W.raycast(ex, ey, ez, dx / L, dy / L, dz / L, L, false, {});
    const k = hit ? Math.max(0.2, (hit.t - 0.3) / L) : 1;
    tmpV.set(ex + dx * k, ey + dy * k, ez + dz * k);
    cam.position.lerp(tmpV, Math.min(1, dt * 6));
    const lx = f.pos.x + fwdX(yaw) * 10, lz = f.pos.z + fwdZ(yaw) * 10, ly = f.pos.y + 1.4 + Math.sin(f.pitch) * 10;
    const ax = lx - cam.position.x, ay = ly - cam.position.y, az = lz - cam.position.z;
    const ry = yawTo(ax, az), rx = Math.atan2(ay, Math.hypot(ax, az));
    cam.rotation.set(lerp(cam.rotation.x, rx, Math.min(1, dt * 8)), cam.rotation.y + angd(cam.rotation.y, ry) * Math.min(1, dt * 8), 0);
  } else {
    orbitCam(dt, m, cam, 70, 42);
  }
  G.audio.listener.x = cam.position.x; G.audio.listener.y = cam.position.y; G.audio.listener.z = cam.position.z; G.audio.listener.yaw = cam.rotation.y;
}
function angd(a, b) { let d = (b - a) % (Math.PI * 2); if (d > Math.PI) d -= Math.PI * 2; if (d < -Math.PI) d += Math.PI * 2; return d; }
function nextFollow(dir) {
  const m = G.match, c = G.ctl;
  const list = m.soldiers.filter((s) => s.alive && s.brain);
  if (!list.length) return;
  let i = list.indexOf(c.follow);
  i = (i + dir + list.length) % list.length;
  c.follow = list[i];
}
function orbitCam(dt, m, cam, R, H) {
  const t = performance.now() / 1000 * 0.05;
  cam.position.set(Math.sin(t) * R, H, Math.cos(t) * R * 1.1);
  const ax = -cam.position.x, ay = 2 - cam.position.y, az = -cam.position.z;
  cam.rotation.order = 'YXZ';
  cam.rotation.set(Math.atan2(ay, Math.hypot(ax, az)), yawTo(ax, az), 0);
}

// ------------------------------------------------------------------------- loop
let last = 0, fpsAcc = 0, fpsN = 0;
G.fps = 0;
function frame(now) {
  requestAnimationFrame(frame);
  let dt = (now - last) / 1000; last = now;
  if (!(dt > 0)) dt = 0.016;
  dt = Math.min(dt, 0.05);
  fpsAcc += dt; fpsN++;
  if (fpsAcc > 1) { G.fps = fpsN / fpsAcc; fpsAcc = 0; fpsN = 0; }
  G.step(dt);
}
G.step = function (dt) {
  const I = G.input;
  if (G.state === 'play' && G.match) {
    const m = G.match;
    if (I.hit('Pause') && !G.paused && m.mode !== 'watch') G.pause();
    // Esc pauses when the pointer was never locked (touch, or the browser refused the lock);
    // with a lock, the browser eats Esc and the lock-change handler pauses instead
    else if (I.hit('Escape') && !G.paused && !I.locked && m.mode !== 'watch' && m.phase !== 'ended') G.pause();
    else if (I.hit('Escape') && G.paused && G.ui.panel === 'pause') { G.resume(); }
    if (!G.paused) {
      if (m.player) playerControl(dt);
      if (G.state !== 'play') { I.endFrame(); return; }
      m.update(dt);
      controllerEvents();
      updateCamera(dt);
      if (!G.match) { I.endFrame(); return; }
      if (m.player) G.vm.update(dt, m.player, { dx: I.mouse.dx, dy: I.mouse.dy });
      G.hud.update(dt, m, m.player, G.renderer.camera, G.ctl);
      G.debug.update(m, G.renderer.camera, m.mode === 'watch' ? null : (G.debug.onlyTeam ?? null));
      m.events.length = 0;
      if (m.phase === 'ended') {
        G.ctl.endT += dt;
        if (G.ctl.endT > 0 && !G.ctl.endBanner) { G.ctl.endBanner = true; const w = m.winner; G.hud.banner(m.mode === 'waves' ? (w === 0 ? 'SURVIVED' : 'OVERRUN') : w === -1 ? 'DRAW' : (m.mode === 'watch' ? (w === 0 ? 'VANGUARD WINS' : 'IRONCLAW WINS') : w === 0 ? 'VICTORY' : 'DEFEAT'), m.mode === 'waves' ? 'Wave ' + m.wave : `${m.tickets[0]} – ${m.tickets[1]}`, w === 0 ? '#7fd0ff' : '#ff8a6a', 3.5); }
        if (G.ctl.endT > 3.5 && G.ui.panel !== 'results') {
          G.input.unlock();
          if (m.mode === 'watch') { G.ctl.endBanner = false; G.quit(); }
          else { const up = G.meta.addReward(m.reward, m.winner === m.playerTeam, m.mode, m.wave); G.paused = true; G.ui.results(m, up); }
          G.ctl.endBanner = false;
        }
      }
    }
  } else if (G.state === 'menu' && G.backdrop) {
    const b = G.backdrop;
    b.update(dt);
    b.events.length = 0;
    if (b.phase === 'ended') { G.menuBackdrop(); }
    orbitCam(dt, b, G.renderer.camera, 62, 30);
    G.audio.listener.x = 0; G.audio.listener.y = 200; G.audio.listener.z = 0;
  }
  G.renderer.update(G.match ? G.match.time : performance.now() / 1000);
  G.renderer.render(G.state === 'play' && G.match && G.match.player && G.renderer.vmScene.visible);
  I.endFrame();
};

// headless test hook: run the simulation without rendering, collecting stats
G.simulate = function (sec, dt = 1 / 30) {
  const m = G.match || G.backdrop;
  const st = G.simStats || (G.simStats = { kills: 0, heads: 0, downs: 0, revives: 0, caps: 0, neutral: 0, radio: [], states: {}, grenades: 0, smokes: 0, steps: 0, playerShots: 0 });
  const n = Math.round(sec / dt);
  for (let i = 0; i < n && G.match === m; i++) {
    if (m.player && !G.autopilot) playerControl(dt);
    const gBefore = m.grenades.length;
    m.update(dt);
    if (m.grenades.length > gBefore) for (const g of m.grenades.slice(gBefore)) { if (g.type === 'smoke') st.smokes++; else st.grenades++; }
    for (const e of m.events) {
      if (e.type === 'kill') { st.kills++; if (e.head) st.heads++; }
      if (e.type === 'capture') st.caps++;
      if (e.type === 'neutral') st.neutral++;
      if (e.type === 'radio' && st.radio.length < 400) st.radio.push(e.who.name + ' (' + e.who.role + ', T' + e.who.team + '): ' + e.text);
      if (e.type === 'revived') st.revives++;
      if (e.type === 'shot') st.playerShots++;
    }
    if (m.player && !m.player.alive && m.mode === 'battle' && m.phase === 'live') { const c = G.ctl; c.deathT = (c.deathT || 6) - dt; if (c.deathT <= 0) { m.respawn(m.player, 'base'); c.deathT = 6; if (m.player.brain) m.player.brain.onSpawn(); } }
    if (m.player) { const was = m.events.find((e) => e.type === 'died'); if (was) G.ctl.deathT = 6; }
    m.events.length = 0;
    if (i % 15 === 0) for (const s of m.soldiers) if (s.brain && s.alive) { const k = s.brain.state; st.states[k] = (st.states[k] || 0) + 1; }
    st.steps++;
    if (m.phase === 'ended') break;
  }
  st.revives = m.soldiers.reduce((a, s) => a + s.revives, 0);
  st.downs = st.downs;
  return { time: m.time, phase: m.phase, winner: m.winner, tickets: m.tickets.slice(), points: m.points.map((p) => p.id + ':' + p.owner), wave: m.wave, ...st, radio: st.radio.length };
};
boot();
