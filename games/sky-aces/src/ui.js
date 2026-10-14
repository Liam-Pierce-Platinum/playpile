// Menus (title, campaign, hangar, settings, online lobby, results, pause) and the in-flight HUD.
import * as THREE from '../vendor/three.module.js';
import { PLANES, TRACKS, MISSIONS, planeById, save, persist, upOf, statsFor, upgradeCost, trackMax, resetSave } from './meta.js';
import { fmtMoney, clamp } from './util.js';
import { ARENA } from './world.js';
import * as A from './audio.js';
import { makePlane, animatePilot } from './models.js';

const $ = (s) => document.querySelector(s);
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const v3 = new THREE.Vector3(), v4 = new THREE.Vector3();

export class UI {
  constructor(app) {
    this.app = app;
    this.root = $('#ui');
    this.panel = '';
    this.incoming = 0;
    this.markers = new Map();
    this.warnT = 0; this.warnText = '';
    this.hitT = 0;
    this.radar = $('#radar').getContext('2d');
    this.isTouch = app.input.isTouch;
    if (this.isTouch) { document.body.classList.add('touch'); app.input.bindTouch($('#touch')); }
    $('#mute').classList.toggle('off', !!save.settings.mute);
    $('#mute').onclick = (e) => { e.stopPropagation(); save.settings.mute = !save.settings.mute; persist(); A.setMuted(save.settings.mute); $('#mute').classList.toggle('off', save.settings.mute); };
    $('#pauseBtn').onclick = () => { if (this.app.state === 'play') this.app.pause(true); };
    addEventListener('keydown', (e) => this.key(e));
    addEventListener('keyup', (e) => { if (e.code === 'Tab') $('#board').classList.add('hide'); });
    // first click anywhere wakes the audio
    addEventListener('pointerdown', () => A.initAudio(), { once: false });
  }

  key(e) {
    const st = this.app.state;
    if (e.code === 'KeyM') { $('#mute').click(); return; }
    if (st === 'play') {
      if (e.code === 'Escape' || e.code === 'KeyP') { if (this.panel === 'pause') this.app.pause(false); else this.app.pause(true); }
      if (e.code === 'Tab') { e.preventDefault(); this.board(); }
      if (e.code === 'KeyR' && this.app.game.phase === 'over' && this.app.game.mode !== 'online') this.app.retry();
      return;
    }
    if (st === 'results' && (e.code === 'KeyR' || e.code === 'Enter' || e.code === 'Space') && this.app.lastCfg) { e.preventDefault(); this.click(); this.app.retry(); }
    if (st === 'menu' && this.panel === 'title' && (e.code === 'Enter' || e.code === 'Space')) { e.preventDefault(); this.play(); }
    if (st === 'menu' && e.code === 'Escape' && this.panel !== 'title' && this.panel !== 'lobby') this.title();
  }
  click() { A.initAudio(); A.sJingle('click'); }
  show(html, name) {
    this.panel = name;
    this.root.innerHTML = html;
    this.root.classList.remove('hide');
    $('#hud').classList.add('hide');
    $('#touch').classList.add('hide');
    $('#pauseBtn').classList.add('hide');
    this.root.querySelectorAll('[data-a]').forEach((b) => b.addEventListener('click', (e) => { e.stopPropagation(); this.click(); this.act(b.dataset.a, b.dataset.v, b); }));
    this.app.setShowcase && this.app.setShowcase(name === 'title' || name === 'hangar' ? save.sel : null, name);
  }
  play() { this.click(); this.app.startMission(this.app.nextMission()); }

  act(a, v, el) {
    const app = this.app;
    if (a === 'play') this.play();
    else if (a === 'title') this.title();
    else if (a === 'campaign') this.campaign();
    else if (a === 'mission') app.startMission(+v);
    else if (a === 'endless') app.startEndless();
    else if (a === 'hangar') this.hangar();
    else if (a === 'settings') this.settings();
    else if (a === 'online') this.online();
    else if (a === 'retry') app.retry();
    else if (a === 'next') app.startMission(app.nextMission());
    else if (a === 'quit') app.quit();
    else if (a === 'resume') app.pause(false);
    else if (a === 'sel') { const p = planeById(v); if (save.owned.includes(v)) { save.sel = v; persist(); } this.hangarSel = v; this.hangar(); }
    else if (a === 'buy') {
      const p = planeById(v);
      if (save.money >= p.price && !save.owned.includes(v)) { save.money -= p.price; save.owned.push(v); save.sel = v; persist(); A.sJingle('buy'); } else A.sJingle('deny');
      this.hangar();
    } else if (a === 'up') {
      const p = planeById(this.hangarSel || save.sel), t = TRACKS.find((x) => x.id === v), up = upOf(p.id), lvl = up[v] || 0;
      const cost = upgradeCost(p, t, lvl);
      if (lvl < trackMax(p, t) && save.money >= cost && save.owned.includes(p.id)) { save.money -= cost; up[v] = lvl + 1; persist(); A.sJingle('buy'); } else A.sJingle('deny');
      this.hangar();
    } else if (a === 'ctrl') { save.settings.ctrl = v; persist(); this.settings(); }
    else if (a === 'invert') { save.settings.invert = !save.settings.invert; persist(); this.settings(); }
    else if (a === 'reset') { if (el.dataset.sure) { resetSave(); this.settings(); } else { el.dataset.sure = 1; el.textContent = 'TAP AGAIN TO WIPE'; } }
    else if (a === 'host') { this.saveName(); app.online.host(); }
    else if (a === 'join') { this.saveName(); const c = $('#code').value; if (c.trim().length >= 4) app.online.join(c); else this.onlineStatus('Type the room code first.', true); }
    else if (a === 'teams') { app.online.setTeams(v === '1'); }
    else if (a === 'start') app.online.start();
    else if (a === 'leave') { app.online.leave(); this.online(); }
    else if (a === 'copy') { const url = this.joinLink(); try { navigator.clipboard.writeText(url); el.textContent = 'COPIED!'; } catch (e) { el.textContent = url; } }
    else if (a === 'lobby') app.online.backToLobby();
  }
  saveName() { const n = $('#pname'); if (n) { save.name = n.value.trim().slice(0, 14); persist(); } }
  joinLink() { return location.origin + location.pathname + '?join=' + this.app.online.code; }

  // ------------------------------------------------------------------ screens
  title() {
    const next = this.app.nextMission();
    const allDone = MISSIONS.every((m) => save.done[m.id]);
    this.show(`<div class="title">
      <div class="logo">SKY <span>ACES</span></div>
      <div class="tag">ARCADE DOGFIGHTS ABOVE THE ISLANDS</div>
      <button class="b red play" data-a="play">PLAY</button>
      <div class="hint">${allDone ? 'All missions flown - replay for stars or try ENDLESS' : 'Mission ' + (next + 1) + ': ' + esc(MISSIONS[next].name)}</div>
      <div class="menu-row">
        <button class="b" data-a="campaign">MISSIONS</button>
        <button class="b" data-a="endless">ENDLESS</button>
        <button class="b blue" data-a="online">ONLINE</button>
        <button class="b gold" data-a="hangar">HANGAR</button>
        <button class="b" data-a="settings">SETTINGS</button>
      </div>
      <div class="cash">${fmtMoney(save.money)}</div>
      <div class="hint">${this.isTouch ? 'Left thumb steers - FIRE / BOOST / MSL / ROLL on the right' : 'Mouse aims - click / Space fire - right click / F missile - Shift boost - Q / E barrel roll - WASD direct'}</div>
    </div>`, 'title');
  }
  campaign() {
    const cards = MISSIONS.map((m, i) => {
      const open = i === 0 || save.done[MISSIONS[i - 1].id] || save.done[m.id];
      const st = save.done[m.id] || 0;
      return `<button class="mis ${open ? '' : 'locked'}" ${open ? `data-a="mission" data-v="${i}"` : 'disabled'}>
        <b>${i + 1}. ${esc(m.name)}</b><small>${esc(m.brief)}</small>
        <span class="stars">${'&#9733;'.repeat(st)}${'&#9734;'.repeat(3 - st)}</span> <small style="display:inline">${fmtMoney(m.reward)}</small></button>`;
    }).join('');
    this.show(`<div class="card"><div class="head"><h2>MISSIONS</h2><div><span class="cash" style="margin:0">${fmtMoney(save.money)}</span> <button class="b" data-a="title">BACK</button></div></div>
      <div class="grid">${cards}</div>
      <div class="menu-row"><button class="b" data-a="endless">ENDLESS WAVES (best: wave ${save.bestWave})</button></div></div>`, 'campaign');
  }
  hangar() {
    const sel = planeById(this.hangarSel || save.sel);
    const owned = save.owned.includes(sel.id);
    const st = statsFor(sel.id, upOf(sel.id));
    const max = { speed: 260, turn: 2.8, hp: 600, dps: 1500, missiles: 12 };
    const dps = st.barrels * st.dmg * st.rof;
    const bar = (l, v, m, txt) => `<span>${l}</span><div class="bar"><i style="width:${clamp(v / m * 100, 3, 100)}%"></i></div>`;
    const planes = PLANES.map((p) => `<button class="pl ${p.id === sel.id ? 'sel' : ''}" data-a="sel" data-v="${p.id}">
      <b><span class="sw" style="background:#${p.colors.body.toString(16).padStart(6, '0')}"></span>${p.name}</b><small>${p.kind} - ${save.owned.includes(p.id) ? (save.sel === p.id ? 'FLYING' : 'owned') : fmtMoney(p.price)}</small></button>`).join('');
    const up = upOf(sel.id);
    const ups = TRACKS.map((t) => {
      const lvl = up[t.id] || 0, mx = trackMax(sel, t);
      const cost = upgradeCost(sel, t, lvl);
      const can = owned && lvl < mx && save.money >= cost;
      return `<div class="up"><div class="nm">${t.name}<small>${t.desc}</small></div>
        <div class="pips">${Array.from({ length: mx }, (_, i) => `<i class="${i < lvl ? 'on' : ''}"></i>`).join('')}</div>
        <button class="b ${can ? 'gold' : ''}" data-a="up" data-v="${t.id}" ${can ? '' : 'disabled'}>${lvl >= mx ? 'MAX' : fmtMoney(cost)}</button></div>`;
    }).join('');
    this.show(`<div class="card"><div class="head"><h2>HANGAR</h2><div><span class="cash" style="margin:0">${fmtMoney(save.money)}</span> <button class="b" data-a="title">BACK</button></div></div>
      <div class="planes">${planes}</div>
      <div class="head" style="margin-top:10px"><div><b style="font-size:22px">${sel.name}</b> <small>${sel.kind}</small><div style="font-size:13px">${esc(sel.desc)}</div></div>
      ${owned ? (save.sel === sel.id ? '<b>FLYING THIS ONE</b>' : `<button class="b blue" data-a="sel" data-v="${sel.id}">FLY THIS</button>`) : `<button class="b ${save.money >= sel.price ? 'gold' : ''}" data-a="buy" data-v="${sel.id}" ${save.money >= sel.price ? '' : 'disabled'}>BUY ${fmtMoney(sel.price)}</button>`}</div>
      <div id="pvwrap"></div>
      <div class="stats">${bar('Speed', st.speed, max.speed)}${bar('Turn', st.turn, max.turn)}${bar('Armour', st.hp, max.hp)}${bar('Firepower', dps, max.dps)}${bar('Missiles', st.missiles, max.missiles)}</div>
      <div style="font-size:12px;margin:-4px 0 8px;font-weight:700">${Math.round(st.speed * 3.6)} km/h - ${st.barrels} guns - ${Math.round(dps)} dmg/s - ${st.hp} HP - ${st.missiles} missiles</div>
      ${owned ? `<div class="ups">${ups}</div>` : '<div style="font-weight:800">Buy this plane to upgrade it.</div>'}
      </div>`, 'hangar');
    this.mountPreview(sel.id, st.barrels);
  }
  /** a little turntable of the selected plane inside the hangar card (its own small renderer) */
  mountPreview(id, barrels) {
    const wrap = $('#pvwrap');
    if (!wrap) return;
    if (!this.pv) {
      const c = document.createElement('canvas');
      let r = null;
      try { r = new THREE.WebGLRenderer({ canvas: c, antialias: true, alpha: true }); } catch (e) { return; }
      r.setPixelRatio(Math.min(2, devicePixelRatio || 1));
      r.outputColorSpace = THREE.SRGBColorSpace; r.toneMapping = THREE.ACESFilmicToneMapping;
      const sc = new THREE.Scene();
      sc.add(new THREE.HemisphereLight(0xe6f2ff, 0x9a8a70, 1.8));
      const d = new THREE.DirectionalLight(0xfff1d8, 2.2); d.position.set(-4, 6, 5); sc.add(d);
      const cam = new THREE.PerspectiveCamera(30, 2, 1, 200);
      cam.position.set(0, 6.5, 25); cam.lookAt(0, 0.6, 0);
      this.pv = { c, r, sc, cam, model: null, key: '' };
    }
    const pv = this.pv;
    wrap.appendChild(pv.c);
    const key = id + ':' + barrels;
    if (pv.key !== key) {
      if (pv.model) pv.sc.remove(pv.model);
      pv.model = makePlane(id, planeById(id).colors, 0xe8433a, barrels);
      pv.sc.add(pv.model); pv.key = key;
    }
    const w = wrap.clientWidth || 300, h = Math.round(Math.min(220, w * 0.42));
    pv.r.setSize(w, h, false); pv.c.style.width = '100%'; pv.c.style.height = h + 'px';
    pv.cam.aspect = w / h; pv.cam.updateProjectionMatrix();
  }
  tickPreview(dt, t) {
    const pv = this.pv;
    if (!pv || this.panel !== 'hangar' || !pv.model) return;
    pv.model.rotation.y = t * 0.5; pv.model.rotation.z = Math.sin(t * 0.8) * 0.08;
    for (const p of pv.model.userData.props) p.rotation.z += dt * 30;
    if (pv.model.userData.pilot) animatePilot(pv.model.userData.pilot, t, 0.5, Math.sin(t * 0.7) * 0.9, 0.1, 0);
    pv.r.render(pv.sc, pv.cam);
  }
  settings() {
    const s = save.settings;
    this.show(`<div class="card"><div class="head"><h2>SETTINGS</h2><button class="b" data-a="title">BACK</button></div>
      <div class="set">Controls <span class="seg"><button class="b ${s.ctrl === 'mouse' ? 'on' : ''}" data-a="ctrl" data-v="mouse">MOUSE AIM</button><button class="b ${s.ctrl === 'keys' ? 'on' : ''}" data-a="ctrl" data-v="keys">KEYBOARD</button></span></div>
      <div class="set">Aim sensitivity <input id="sens" type="range" min="0.4" max="2" step="0.1" value="${s.sens}"></div>
      <div class="set">Invert pitch <button class="b ${s.invert ? 'on' : ''}" data-a="invert">${s.invert ? 'ON' : 'OFF'}</button></div>
      <div class="set">Pilot name <input id="pname" type="text" maxlength="14" value="${esc(save.name)}" placeholder="Pilot"></div>
      <div class="keys"><b>Mouse aim:</b> move the mouse to put the circle where you want to go, the plane follows. <kbd>Click</kbd>/<kbd>Space</kbd> guns, <kbd>Right click</kbd>/<kbd>F</kbd> missile (hold the target in the dashed ring to lock), <kbd>Shift</kbd> boost, <kbd>Q</kbd>/<kbd>E</kbd> barrel roll (shakes missiles), <kbd>C</kbd> look back, <kbd>Tab</kbd> scores, <kbd>Esc</kbd> pause, <kbd>M</kbd> mute.<br>
      <b>Keyboard:</b> <kbd>S</kbd> pull up, <kbd>W</kbd> push down, <kbd>A</kbd>/<kbd>D</kbd> roll - works in either mode while held.</div>
      <div class="menu-row"><button class="b red" data-a="reset">RESET SAVE</button></div></div>`, 'settings');
    $('#sens').oninput = (e) => { s.sens = +e.target.value; persist(); };
    $('#pname').onchange = () => this.saveName();
  }
  online() {
    const o = this.app.online;
    this.show(`<div class="card"><div class="head"><h2>ONLINE DOGFIGHT</h2><button class="b" data-a="title">BACK</button></div>
      <div style="font-weight:700;font-size:14px">Up to 8 planes, peer to peer: one player hosts, friends join with the room code. Bots fill the empty slots. Free-for-all or two teams.</div>
      <div class="set">Pilot name <input id="pname" type="text" maxlength="14" value="${esc(save.name)}" placeholder="Pilot"></div>
      <div class="set"><button class="b red" data-a="host">HOST A ROOM</button>
      <span><input id="code" class="codein" maxlength="5" placeholder="CODE" value="${esc((new URLSearchParams(location.search).get('join') || '').toUpperCase())}"> <button class="b blue" data-a="join">JOIN</button></span></div>
      <div id="ostatus" class="status ${o.error ? 'err' : ''}">${esc(o.error || o.statusText || '')}</div>
      <div style="font-size:12px;font-weight:700">You fly your hangar plane with its upgrades. Kills pay ${fmtMoney(250)}, placing pays a bonus.</div></div>`, 'online');
  }
  onlineStatus(t, err) { const el = $('#ostatus'); if (el) { el.textContent = t; el.classList.toggle('err', !!err); } }
  onlineError(t) { if (this.panel !== 'online') this.online(); this.onlineStatus(t, true); }
  lobby() {
    if (this.app.state === 'play') return;
    const o = this.app.online;
    const host = o.role === 'host';
    const list = o.players.map((p, i) => `<div class="${o.cfg.teams ? 't' + p.team : ''}"><span>${esc(p.name)}${i === 0 ? ' (host)' : ''}</span><small>${planeById(p.planeId).name}</small></div>`).join('');
    const bots = 8 - o.players.length;
    this.show(`<div class="card"><div class="head"><h2>ROOM ${esc(o.code)}</h2><button class="b" data-a="leave">LEAVE</button></div>
      ${host ? `<div class="set">Share <span><button class="b" data-a="copy">COPY JOIN LINK</button></span></div>` : ''}
      <div class="set">Mode <span class="seg">${host ? `<button class="b ${!o.cfg.teams ? 'on' : ''}" data-a="teams" data-v="0">FREE-FOR-ALL</button><button class="b ${o.cfg.teams ? 'on' : ''}" data-a="teams" data-v="1">TWO TEAMS</button>` : `<b>${o.cfg.teams ? 'TWO TEAMS' : 'FREE-FOR-ALL'}</b>`}</span></div>
      <div style="font-weight:700;font-size:13px">First to ${o.cfg.goal} kills${o.cfg.teams ? ' (team)' : ''} or ${Math.round(o.cfg.time / 60)} minutes.</div>
      <div class="plist">${list}${bots > 0 ? `<div><span>+ ${bots} bot${bots > 1 ? 's' : ''}</span><small>AI pilots</small></div>` : ''}</div>
      <div id="ostatus" class="status">${esc(o.statusText || '')}</div>
      ${host ? '<div class="menu-row"><button class="b red play" data-a="start">START</button></div>' : '<div style="font-weight:800">Waiting for the host to start...</div>'}</div>`, 'lobby');
  }
  pauseMenu() {
    const on = this.app.game.mode === 'online';
    this.show(`<div class="card" style="max-width:420px;text-align:center"><h2>${on ? 'MENU' : 'PAUSED'}</h2>
      <button class="b red" data-a="resume">RESUME</button>
      ${on ? '' : '<button class="b" data-a="retry">RESTART</button>'}
      <button class="b" data-a="quit">${on ? 'LEAVE MATCH' : 'QUIT'}</button>
      <div class="keys" style="margin-top:10px">Mouse aims - Click/Space guns - Right click/F missile - Shift boost - Q/E roll - C look back - WASD direct</div></div>`, 'pause');
    if (on) { $('#hud').classList.remove('hide'); }
  }
  results(r) {
    const m = r.mode === 'mission' ? MISSIONS[r.mission] : null;
    const hasNext = r.win && m && r.mission < MISSIONS.length - 1;
    const rows = [['Kills', r.kills], ['Kill money', fmtMoney(r.earned)]];
    if (r.bonus) rows.push(['Mission reward', fmtMoney(r.bonus)]);
    if (r.mode === 'endless') rows.unshift(['Waves survived', Math.max(0, r.wave - 1)]);
    rows.push(['Time', Math.floor(r.time / 60) + ':' + String(Math.floor(r.time % 60)).padStart(2, '0')]);
    this.show(`<div class="card res" style="max-width:460px">
      <div class="big" style="color:${r.win ? 'var(--green)' : 'var(--red)'}">${r.win ? 'VICTORY' : r.mode === 'endless' ? 'SHOT DOWN' : 'MISSION FAILED'}</div>
      <div class="why">${esc(m ? m.name + ' - ' : '')}${esc(r.why)}</div>
      ${r.win && m ? `<div class="stars" style="font-size:34px">${'&#9733;'.repeat(r.stars)}${'&#9734;'.repeat(3 - r.stars)}</div>` : ''}
      <table>${rows.map(([a, b]) => `<tr><td>${a}</td><td>${b}</td></tr>`).join('')}<tr class="tot"><td>Earned</td><td>${fmtMoney(r.earned + r.bonus)}</td></tr></table>
      <div class="cash">BANK ${fmtMoney(save.money)}</div>
      <div class="menu-row">${hasNext ? '<button class="b red" data-a="next">NEXT MISSION</button>' : ''}
        <button class="b ${hasNext ? '' : 'red'}" data-a="retry">${r.win ? 'FLY AGAIN' : 'RETRY'} <small class="kh">(R)</small></button>
        <button class="b gold" data-a="hangar">HANGAR</button><button class="b" data-a="title">MENU</button></div></div>`, 'results');
  }
  onlineResults(res, me) {
    this.app.state = 'results';
    this.app.input.enabled = false; this.app.input.unlock();
    const o = this.app.online, host = o.role === 'host';
    const G = this.app.game;
    const rows = res.table.map((r, i) => `<tr class="${G.player && r[0] === G.player.id ? 'me' : ''}"><td>${i + 1}. ${esc(r[1])}</td><td>${res.teams ? (r[4] ? 'RED' : 'BLUE') : ''}</td><td>${r[2]} / ${r[3]}</td></tr>`).join('');
    this.show(`<div class="card res" style="max-width:480px"><div class="big">${res.teams ? (res.tk[0] > res.tk[1] ? 'BLUE WINS' : res.tk[1] > res.tk[0] ? 'RED WINS' : 'DRAW') : (me.place === 1 ? 'YOU WIN!' : 'PLACE ' + me.place)}</div>
      ${res.teams ? `<div class="why">BLUE ${res.tk[0]} - ${res.tk[1]} RED</div>` : ''}
      <table>${rows}</table>
      <table><tr><td>Kill money</td><td>${fmtMoney(me.earned)}</td></tr><tr><td>Placing bonus</td><td>${fmtMoney(me.bonus)}</td></tr><tr class="tot"><td>Earned</td><td>${fmtMoney(me.total)}</td></tr></table>
      <div class="menu-row">${host ? '<button class="b red" data-a="lobby">BACK TO LOBBY</button>' : '<b>Waiting for the host...</b>'}<button class="b" data-a="quit">LEAVE</button></div></div>`, 'oresults');
  }

  // ------------------------------------------------------------------ HUD
  hud() {
    this.panel = 'hud';
    this.root.innerHTML = '';
    $('#hud').classList.remove('hide');
    $('#touch').classList.toggle('hide', !this.isTouch);
    $('#pauseBtn').classList.toggle('hide', !this.isTouch);
    $('#feed').innerHTML = ''; $('#pops').innerHTML = '';
    $('#dead').classList.add('hide');
    $('#board').classList.add('hide');
    this.app.setShowcase && this.app.setShowcase(null);
    this.tips();
  }
  /** first-flight controls card: shown on the first two missions (or until the player has a few kills), fades by itself */
  tips() {
    const G = this.app.game, el = $('#tips');
    clearTimeout(this.tipT); el.classList.remove('on');
    if (G.mode !== 'mission' || G.cfg.mission > 1 || (save.kills || 0) > 12 || this.app.bot) return;
    el.innerHTML = this.isTouch
      ? '<b>LEFT THUMB</b> steer &middot; hold <b>FIRE</b> when the enemy is in the circle &middot; <b>MSL</b> after LOCK &middot; <b>ROLL</b> dodges missiles'
      : '<b>MOVE MOUSE</b> to steer &middot; <b>CLICK / SPACE</b> guns &middot; <b>RIGHT CLICK</b> missile after LOCK &middot; <b>SHIFT</b> boost &middot; <b>Q/E</b> roll';
    requestAnimationFrame(() => el.classList.add('on'));
    this.tipT = setTimeout(() => el.classList.remove('on'), 9000);
  }
  feed(d) {
    const el = document.createElement('div');
    const me = (d.by && d.by.isPlayer) || d.victim.isPlayer;
    if (me) el.className = 'me';
    const how = d.how === 'missile' ? ' &#10148; ' : d.how === 'crash' ? ' &#8600; ' : ' &#8226;&#8226; ';
    el.innerHTML = d.by && d.by !== d.victim ? `${esc(d.by.name)}${how}${esc(d.victim.name)}` : `${esc(d.victim.name)} crashed`;
    const f = $('#feed'); f.prepend(el);
    while (f.children.length > 6) f.lastChild.remove();
    setTimeout(() => el.remove(), 6000);
    if (d.victim.isPlayer && this.app.game.mode === 'online') { const dd = $('#dead'); dd.textContent = d.by && d.by !== d.victim ? 'SHOT DOWN BY ' + d.by.name.toUpperCase() : 'CRASHED'; dd.classList.remove('hide'); }
  }
  note(t) { const el = document.createElement('div'); el.textContent = t; const f = $('#feed'); f.prepend(el); setTimeout(() => el.remove(), 5000); }
  respawned() { $('#dead').classList.add('hide'); }
  hitMarker(kill) { this.hitT = 0.12; $('#hitm').classList.toggle('kill', !!kill); }
  killConfirm() { this.hitT = 0.3; $('#hitm').classList.add('kill'); }
  callout(t, sub) { const c = $('#callout'); c.innerHTML = esc(t) + (sub ? `<small>${esc(sub)}</small>` : ''); c.classList.remove('go'); void c.offsetWidth; c.classList.add('go'); }
  banner(t, sub) { const b = $('#banner'); b.querySelector('b').textContent = t; b.querySelector('span').textContent = sub || ''; b.querySelector('span').style.display = sub ? '' : 'none'; b.classList.remove('go'); void b.offsetWidth; b.classList.add('go'); }
  moneyPop(n, label) {
    const el = document.createElement('div');
    el.textContent = '+' + fmtMoney(n) + (label ? '  ' + label : '');
    el.style.top = (-($('#pops').children.length % 3) * 26) + 'px';
    $('#pops').appendChild(el); setTimeout(() => el.remove(), 1200);
  }
  flashWarn(t) { this.warnText = t; this.warnT = 1.2; }
  board() {
    const G = this.app.game;
    if (G.mode !== 'online') return;
    const rows = this.app.online.standings().map((p) => `<tr class="${p.isPlayer ? 'me' : ''}"><td>${esc(p.name)}</td><td>${p.team === 0 ? 'BLUE' : p.team === 1 ? 'RED' : ''}</td><td>${p.kills}</td><td>${p.deaths}</td></tr>`).join('');
    const b = $('#board'); b.innerHTML = `<table><tr><th>PILOT</th><th></th><th>K</th><th>D</th></tr>${rows}</table>`; b.classList.remove('hide');
  }

  toScreen(p, cam, out) {
    v4.copy(p).project(cam);
    out.x = (v4.x * 0.5 + 0.5) * innerWidth; out.y = (-v4.y * 0.5 + 0.5) * innerHeight;
    out.behind = v4.z > 1 || v4.z < -1;
    out.on = !out.behind && out.x > 0 && out.x < innerWidth && out.y > 0 && out.y < innerHeight;
    return out;
  }

  frame(dt, o) {
    const app = this.app, G = app.game, P = G.player, cam = o.camera;
    if (!P || this.panel !== 'hud' && this.panel !== 'pause') return;
    $('#cloud').style.opacity = (o.cloud * 0.9).toFixed(3);
    $('#vig').style.opacity = Math.min(1, o.dmg * 0.9 + (P.alive && P.hp / P.maxHp < 0.3 ? 0.25 + 0.15 * Math.sin(performance.now() / 150) : 0)).toFixed(3);
    const s = { x: 0, y: 0 };
    // aim circle + nose reticle
    const aimP = v3.copy(G.aim).multiplyScalar(600).add(P.pos);
    this.toScreen(aimP, cam, s);
    const aimc = $('#aimc');
    const showAim = P.alive && !P.botBrain;
    aimc.style.display = showAim && !s.behind ? '' : 'none';
    aimc.style.left = s.x + 'px'; aimc.style.top = s.y + 'px';
    const noseP = v3.copy(P.fwd).multiplyScalar(420).add(P.pos);
    this.toScreen(noseP, cam, s);
    const nose = $('#nose');
    nose.style.display = P.alive && !s.behind ? '' : 'none';
    nose.style.left = s.x + 'px'; nose.style.top = s.y + 'px';
    const nx = s.x, ny = s.y;
    // hit marker sits on the nose reticle
    this.hitT -= dt;
    const hm = $('#hitm'); hm.style.opacity = this.hitT > 0 ? 1 : 0; hm.style.left = nx + 'px'; hm.style.top = ny + 'px';
    // markers
    const seen = new Set();
    let leadT = null, leadD = 1e9;
    const mk = $('#markers');
    for (const q of G.planes) {
      if (q === P || !q.alive) continue;
      seen.add(q);
      let el = this.markers.get(q);
      if (!el) { el = document.createElement('div'); el.innerHTML = '<b></b><em></em><div class="hpb"><i></i></div>'; mk.appendChild(el); this.markers.set(q, el); }
      const hostile = G.hostile(P, q);
      const d = q.pos.distanceTo(P.pos);
      this.toScreen(q.pos, cam, s);
      const big = q.kind !== 'fighter';
      if (s.on) {
        el.className = 'mk' + (hostile ? '' : ' ally') + (big ? ' big' : '');
        el.style.left = s.x + 'px'; el.style.top = s.y + 'px'; el.style.transform = 'translate(-50%,-50%)';
        el.style.display = d < 4000 ? '' : 'none';
        const showName = big || q.cls === 'ace' || q.human || d < 700;
        el.children[0].textContent = showName ? q.name : '';
        el.children[1].textContent = d < 2500 ? (d < 1000 ? Math.round(d) + 'm' : (d / 1000).toFixed(1) + 'km') : '';
        el.children[2].style.display = hostile ? '' : 'none';
        el.children[2].firstChild.style.width = (q.hp / q.maxHp * 100) + '%';
        // lead target: the hostile closest to the nose reticle on screen
        if (hostile && d < 900) { const sd = Math.hypot(s.x - nx, s.y - ny); if (sd < leadD) { leadD = sd; leadT = q; } }
      } else if (hostile && d < 2600 || big) {
        // off-screen arrow on the edge
        let x = s.x - innerWidth / 2, y = s.y - innerHeight / 2;
        if (s.behind) { x = -x; y = -y; }
        const a = Math.atan2(y, x);
        const rx = innerWidth / 2 - 40, ry = innerHeight / 2 - 40;
        const k = Math.min(rx / Math.abs(Math.cos(a) || 1e-3), ry / Math.abs(Math.sin(a) || 1e-3));
        el.className = 'mk off' + (hostile ? '' : ' ally');
        el.style.display = '';
        el.style.left = (innerWidth / 2 + Math.cos(a) * k) + 'px'; el.style.top = (innerHeight / 2 + Math.sin(a) * k) + 'px';
        el.style.transform = `translate(-50%,-50%) rotate(${a + Math.PI / 2}rad)`;
        el.children[0].textContent = ''; el.children[1].textContent = '';
        el.children[2].style.display = 'none';
      } else el.style.display = 'none';
    }
    for (const [q, el] of this.markers) if (!seen.has(q)) { el.remove(); this.markers.delete(q); }
    // lead indicator
    const lead = $('#lead');
    if (leadT && P.alive && leadD < innerHeight * 0.4) {
      const tof = leadT.pos.distanceTo(P.pos) / 820;
      this.toScreen(v3.copy(leadT.pos).addScaledVector(leadT.vel, tof).addScaledVector(P.vel, -tof * 0.0), cam, s);
      lead.style.display = s.on ? 'block' : 'none'; lead.style.left = s.x + 'px'; lead.style.top = s.y + 'px';
    } else lead.style.display = 'none';
    // lock ring
    const lk = $('#lock');
    if (P.alive && P.lockTarget && P.missiles > 0) {
      this.toScreen(P.lockTarget.pos, cam, s);
      const k = clamp(P.lockT / P.st.lock, 0, 1);
      lk.style.display = s.on ? 'block' : 'none';
      lk.style.left = s.x + 'px'; lk.style.top = s.y + 'px';
      lk.style.width = lk.style.height = (90 - k * 50) + 'px'; lk.style.margin = -(45 - k * 25) + 'px 0 0 ' + -(45 - k * 25) + 'px';
      lk.classList.toggle('on', P.locked);
      A.sLockTone(P.locked ? 2 : 1);
    } else { lk.style.display = 'none'; A.sLockTone(0); }
    // panel
    const hpR = P.hp / P.maxHp;
    $('.bar.hp i').style.width = (hpR * 100) + '%'; $('.bar.hp').classList.toggle('low', hpR < 0.3); $('.bar.hp').classList.toggle('rep', !!P.repairing);
    $('.bar.bo i').style.width = (P.boostE * 100) + '%';
    $('.bar.ht i').style.width = (P.overheat > 0 ? 100 : P.heat * 100) + '%'; $('.bar.ht').classList.toggle('over', P.overheat > 0);
    $('#spd').textContent = Math.round(P.speed * 3.6);
    $('#alt').textContent = Math.max(0, Math.round(P.pos.y));
    $('#msl').textContent = P.missiles;
    // objective
    $('#obj').textContent = this.objective();
    $('#money').textContent = G.earned ? '+' + fmtMoney(G.earned) : '';
    // warnings
    this.incoming -= dt;
    this.warnT -= dt;
    const w = $('#warn');
    let wt = '', blink = false;
    if (P.alive) {
      if (this.incoming > 0) { wt = 'MISSILE INCOMING - BARREL ROLL! (Q/E)'; blink = true; A.sWarn(); }
      else if (P.pos.y < 120 && P.vel.y < -12) { wt = 'PULL UP'; blink = true; }
      else if (G.planes.some((s) => s.kind === 'airship' && s.alive && v3.copy(P.pos).addScaledVector(P.vel, 1.5).distanceTo(s.pos) < 70 * (s.scale || 1))) { wt = 'COLLISION - PULL AWAY'; blink = true; }
      else if (P.stallWarn) { wt = 'STALL - DIVE FOR SPEED'; blink = true; }
      else if (Math.hypot(P.pos.x, P.pos.z) > ARENA) { wt = 'RETURN TO THE BATTLE'; }
      else if (this.warnT > 0) wt = this.warnText;
    }
    if (this.isTouch && wt.includes('(Q/E)')) wt = 'MISSILE INCOMING - ROLL!';
    w.textContent = wt; w.classList.toggle('blink', blink);
    this.drawRadar(P, G);
  }
  objective() {
    const G = this.app.game;
    if (G.mode === 'online') {
      const o = this.app.online;
      const tl = o.role === 'host' ? Math.max(0, Math.round(o.matchT)) : (o.timeLeft ?? 0);
      const clock = Math.floor(tl / 60) + ':' + String(tl % 60).padStart(2, '0');
      if (o.cfg.teams) { const tk = o.teamKills(); return `BLUE ${tk[0]} - ${tk[1]} RED   ${clock}`; }
      const top = o.standings()[0];
      return `${clock}   ${G.player ? 'YOU ' + G.player.kills : ''}   LEADER ${top ? top.kills : 0}/${o.cfg.goal}`;
    }
    const foes = G.planes.filter((p) => p.alive && p.team !== 0);
    const left = foes.length;
    let s = G.mode === 'mission' ? (G.mission.waves.length > 1 ? `WAVE ${G.wave}/${G.mission.waves.length} - ` : '') : `WAVE ${G.wave} - `;
    s += `${left} ENEM${left === 1 ? 'Y' : 'IES'} LEFT`;
    const bombers = foes.filter((p) => p.kind === 'bomber');
    if (G.defend && bombers.length) {
      const near = Math.min(...bombers.map((b) => b.brain ? b.brain.distToGoal || 9999 : 9999));
      s = `STOP THE BOMBERS - ${bombers.length} LEFT - NEAREST ${(near / 1000).toFixed(1)} KM FROM HARBOUR`;
    }
    const ship = foes.find((p) => p.kind === 'airship');
    if (ship) s += ship.turrets.some((u) => u.alive) ? ' - SHOOT THE TURRETS + ENGINE PODS' : ' - HULL EXPOSED!';
    return s;
  }
  drawRadar(P, G) {
    const c = this.radar, W = 160, R = 74, range = 2600;
    c.clearRect(0, 0, W, W);
    c.save(); c.translate(W / 2, W / 2);
    c.strokeStyle = 'rgba(255,255,255,0.35)'; c.lineWidth = 1.5;
    c.beginPath(); c.arc(0, 0, R, 0, Math.PI * 2); c.stroke();
    c.beginPath(); c.arc(0, 0, R / 2, 0, Math.PI * 2); c.stroke();
    const yaw = Math.atan2(P.fwd.x, -P.fwd.z);
    c.rotate(-yaw);
    const dot = (x, z, col, r) => {
      const dx = (x - P.pos.x) / range * R, dz = (z - P.pos.z) / range * R;
      const d = Math.hypot(dx, dz);
      const k = d > R - 4 ? (R - 4) / d : 1;
      c.fillStyle = col; c.beginPath(); c.arc(dx * k, dz * k, r, 0, Math.PI * 2); c.fill();
    };
    // arena edge
    c.strokeStyle = 'rgba(255,120,90,0.6)';
    c.beginPath(); c.arc(-P.pos.x / range * R, -P.pos.z / range * R, ARENA / range * R, 0, Math.PI * 2); c.stroke();
    if (G.defend) dot(420, 380, '#ffe08a', 5);
    for (const q of G.planes) {
      if (q === P || !q.alive) continue;
      dot(q.pos.x, q.pos.z, G.hostile(P, q) ? '#ff5a3a' : '#6fe0a0', q.kind === 'fighter' ? 3 : 6);
    }
    for (const m of G.missiles) if (m.alive) dot(m.pos.x, m.pos.z, '#ffffff', 2);
    c.restore();
    c.fillStyle = '#fff'; c.beginPath(); c.moveTo(W / 2, W / 2 - 7); c.lineTo(W / 2 - 5, W / 2 + 5); c.lineTo(W / 2 + 5, W / 2 + 5); c.fill();
  }
}
