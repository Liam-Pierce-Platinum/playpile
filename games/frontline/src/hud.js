// HUD overlay (DOM + one minimap canvas). Reads match events each frame.
import * as THREE from '../vendor/three.module.js';
import { TEAM_LOOK } from './models.js';
import { WEAPONS } from './weapons.js';
import { yawTo, angDiff, clamp } from './util.js';

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s).replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));

export class HUD {
  constructor() {
    this.el = $('hud');
    this.el.innerHTML = `
      <div id="xh"><i class="t"></i><i class="b"></i><i class="l"></i><i class="r"></i><b></b></div>
      <div id="hm"><i></i><i></i><i></i><i></i></div>
      <div id="top"><div class="tk t0"><span id="tk0">200</span><div class="bar"><div id="tb0"></div></div></div><div id="pts"></div><div class="tk t1"><div class="bar"><div id="tb1"></div></div><span id="tk1">200</span></div></div>
      <div id="clock"></div>
      <canvas id="mini" width="200" height="200"></canvas>
      <div id="feed"></div>
      <div id="radio"></div>
      <div id="pops"></div>
      <div id="banner"><b></b><span></span></div>
      <div id="dmg"></div>
      <div id="vig"></div><div id="supv"></div>
      <div id="prompt"></div>
      <div id="hp"><div class="lbl">HEALTH</div><div class="bar"><div id="hpb"></div></div><span id="hpn">100</span></div>
      <div id="nade"></div>
      <div id="ammo"><div id="wname"></div><div id="wmag"><b id="mag">30</b><span id="res">/ 120</span></div><div id="slots"></div></div>
      <div id="scope"><div class="ret"></div></div><div id="optic"><div class="ring"></div></div>
      <div id="downed"><b>YOU ARE DOWN</b><span id="downt"></span><small>Stay low. A medic or squadmate can revive you. Hold SPACE to respawn now.</small><div class="bar"><div id="revb"></div></div></div>
      <div id="dead" class="panel"></div>
      <div id="board" class="panel"></div>
      <div id="wave"></div>
      <div id="spec"></div>
      <div id="obj"><b></b><span></span></div>
      <div id="tip"></div>
      <div id="labels"></div>`;
    this.feed = $('feed'); this.radioEl = $('radio'); this.pops = $('pops');
    this.mini = $('mini'); this.mctx = this.mini.getContext('2d');
    this.hitT = 0; this.vigT = 0; this.supT = 0; this.bannerT = 0;
    this.dmgArcs = [];
    this.spots = [];
    this.visible = false;
    this._v = new THREE.Vector3();
    this.tutorial = false; this.tips = []; this.tipT = 0;
  }
  // first matches: a short run of tips, one at a time
  startTips(mode) {
    this.tips = !this.tutorial ? [] : mode === 'waves' ? [
      'Hunters are coming for you. Use cover: crouch (C) behind walls and peek out to shoot.',
      'Right mouse aims down sights. Short bursts are far more accurate than holding the trigger.',
      'G throws a frag. It flushes out enemies hiding behind cover.',
      'Clear a wave to restock health and ammo. Spend credits in the ARMORY between runs.',
    ] : mode === 'battle' ? [
      'Follow the marker to your squad objective. Stand inside a ring to capture it.',
      'Holding more points than the enemy drains their tickets. First team to 0 loses.',
      'Right mouse aims down sights. Fire in short bursts. Crouch (C) behind cover to heal.',
      'G throws a frag at enemies behind cover. Hold E on a downed teammate to revive them.',
      'Kills, captures and revives earn credits. Unlock guns and attachments in the ARMORY.',
    ] : [];
    this.tipT = 2.5; this.tipOn = false;
    const el = $('tip'); el.classList.remove('on');
  }
  updateTips(dt, m) {
    if (!this.tips.length && !this.tipOn) return;
    if (m.phase !== 'live') return;
    this.tipT -= dt;
    if (this.tipT > 0) return;
    const el = $('tip');
    if (this.tipOn) { el.classList.remove('on'); this.tipOn = false; this.tipT = 2.5; return; }
    const t = this.tips.shift(); if (!t) return;
    el.innerHTML = '<small>TIP</small> ' + esc(t); el.classList.add('on'); this.tipOn = true; this.tipT = 6.5;
  }
  // on-screen objective marker for the player's squad order (clamped to the screen edge)
  objMarker(m, p, cam) {
    const el = $('obj');
    const o = p && p.squad && p.squad.order;
    if (!o || !o.point || !p.alive || m.mode !== 'battle') { el.style.display = 'none'; for (const q of m.points) if (q.sprite) q.sprite.visible = true; return; }
    const pt = o.point, mine = pt.owner === p.team;
    // the marker replaces that point's floating letter (two 'B's on screen read as two objectives)
    for (const q of m.points) if (q.sprite) q.sprite.visible = q !== pt;
    const d = Math.hypot(pt.x - p.pos.x, pt.z - p.pos.z);
    const inside = d < pt.r;
    const verb = inside ? (pt.contested ? 'CONTESTED' : mine && Math.abs(pt.prog) >= 1 ? 'HOLD' : 'CAPTURING') : (o.type === 'defend' || mine ? 'DEFEND' : 'ATTACK');
    el.querySelector('b').textContent = pt.id;
    el.querySelector('span').textContent = inside ? verb + (verb === 'CAPTURING' ? ' ' + Math.round(Math.abs(pt.prog) * 100) + '%' : '') : verb + ' · ' + Math.round(d) + 'm';
    el.className = (mine ? 'o0' : pt.owner === 1 ? 'o1' : 'on') + (pt.contested ? ' ct' : '') + (inside ? ' in' : '');
    const v = this._v.set(pt.x, (pt.y || 0) + 3, pt.z).project(cam);
    let x = v.x, y = v.y;
    if (v.z > 1) { x = -x; y = -y; } // behind the camera: mirror so it sticks to the right edge
    const W = innerWidth, H = innerHeight;
    let sx = (x * 0.5 + 0.5) * W, sy = (-y * 0.5 + 0.5) * H;
    const off = v.z > 1 || sx < 40 || sx > W - 40 || sy < 70 || sy > H - 90;
    if (off) {
      const cx = W / 2, cy = H / 2, dx = sx - cx, dy = sy - cy;
      const k = Math.min((W / 2 - 50) / Math.max(1, Math.abs(dx)), (H / 2 - 90) / Math.max(1, Math.abs(dy)));
      sx = cx + dx * k; sy = cy + dy * k;
    }
    if (inside) { sx = W / 2; sy = H * 0.2; }
    // keep clear of the radio log (top left): slide below it
    if (this.radioEl && this.radioEl.childElementCount) {
      if ((this._rT = (this._rT || 0) + 1) % 15 === 1) this._rr = this.radioEl.getBoundingClientRect();
      const r = this._rr;
      if (r && r.height > 0 && sx - 60 < r.right && sy + 22 > r.top && sy - 22 < r.bottom) sy = r.bottom + 26;
    }
    el.style.display = 'flex';
    el.style.transform = `translate(${sx.toFixed(0)}px, ${sy.toFixed(0)}px) translate(-50%, -50%)`;
    el.style.opacity = p.adsK > 0.6 && !inside ? 0.35 : 1;
  }
  show(on) { this.el.style.display = on ? '' : 'none'; this.visible = on; document.body.classList.toggle('ingame', !!on); }
  reset(match) {
    this.match = match;
    this.feed.innerHTML = ''; this.radioEl.innerHTML = ''; this.pops.innerHTML = '';
    $('dmg').innerHTML = ''; this.dmgArcs = []; this.spots = [];
    $('dead').style.display = 'none'; $('downed').style.display = 'none'; $('board').style.display = 'none';
    $('top').style.display = match.mode === 'waves' ? 'none' : '';
    $('clock').style.display = match.mode === 'waves' ? 'none' : '';
    $('wave').style.display = match.mode === 'waves' ? '' : 'none';
    this.drawMiniBase(match);
    this.startTips(match.mode);
    $('pts').innerHTML = match.points.map((p) => `<div class="pt" id="pt${p.id}"><svg viewBox="0 0 40 40"><circle cx="20" cy="20" r="16" class="bg"/><circle cx="20" cy="20" r="16" class="fg" stroke-dasharray="100.5" stroke-dashoffset="100.5"/></svg><b>${p.id}</b></div>`).join('');
  }
  // static minimap image (top-down boxes)
  drawMiniBase(m) {
    const W = m.def.w, D = m.def.d;
    const c = document.createElement('canvas'); c.width = 240; c.height = 320;
    const g = c.getContext('2d');
    const sx = 240 / W, sz = 320 / D;
    g.fillStyle = '#25302a'; g.fillRect(0, 0, 240, 320);
    // ground shading from the nav grid
    const nav = m.nav;
    for (let iz = 0; iz < nav.nz; iz += 2) for (let ix = 0; ix < nav.nx; ix += 2) {
      const i = iz * nav.nx + ix;
      if (nav.water[i]) g.fillStyle = '#2f5f7a';
      else if (!nav.walk[i]) continue;
      else { const h = nav.h[i]; const v = clamp(60 + h * 12, 30, 140); g.fillStyle = `rgb(${v * 0.75 | 0},${v | 0},${v * 0.72 | 0})`; }
      g.fillRect(ix * sx, iz * sz, sx * 2 + 0.5, sz * 2 + 0.5);
    }
    for (const b of m.def.boxes) {
      if (b.y1 - b.y0 < 0.6 || b.x1 - b.x0 > W * 0.5) continue;
      if (!b.solid) { g.fillStyle = 'rgba(40,80,40,0.6)'; }
      else g.fillStyle = b.y1 > 2.5 ? '#c9c2b4' : '#8d887e';
      g.fillRect((b.x0 + W / 2) * sx, (b.z0 + D / 2) * sz, Math.max(1, (b.x1 - b.x0) * sx), Math.max(1, (b.z1 - b.z0) * sz));
    }
    this.miniBase = c; this.miniScale = [sx, sz];
  }
  // ------------------------------------------------------------------ events
  consume(m, player) {
    for (const e of m.events) {
      switch (e.type) {
        case 'kill': this.killFeed(e, m); break;
        case 'hit': this.hitT = e.kill ? 0.35 : 0.18; this.hitHead = e.head; this.hitKill = e.kill; break;
        case 'hurt': this.vigT = Math.min(1, this.vigT + 0.35 + e.dmg / 80); if (e.from && player) this.addArc(e.from); break;
        case 'suppressed': this.supT = Math.min(1, this.supT + e.amt); break;
        case 'popup': this.popup(e.text); break;
        case 'radio': this.radio(e.who, e.text, m); break;
        case 'spot': this.spots.push({ x: e.pos.x, z: e.pos.z, t: e.t }); break;
        case 'banner': this.banner(e.text, e.sub); break;
        case 'capture': this.banner(e.team === m.playerTeam ? `${e.point.id} CAPTURED` : `${e.point.id} LOST`, e.point.name, e.team === m.playerTeam ? TEAM_LOOK[0].css : TEAM_LOOK[1].css, 2.2); break;
        case 'neutral': if (e.prev === m.playerTeam) this.banner(`${e.point.id} NEUTRALISED`, 'Retake it!', '#ffd040', 1.8); break;
      }
    }
  }
  killFeed(e, m) {
    const k = e.killer, v = e.victim;
    const col = (s) => s ? (s.isPlayer ? '#ffe36a' : TEAM_LOOK[s.team].css) : '#ccc';
    const d = document.createElement('div');
    d.className = 'kf' + ((k && k.isPlayer) || v.isPlayer ? ' me' : '');
    const wn = WEAPONS[e.weapon] ? WEAPONS[e.weapon].short : e.weapon === 'frag' ? 'FRAG' : e.weapon === 'fall' ? 'FALL' : (e.weapon || '').toUpperCase();
    d.innerHTML = `${k ? `<b style="color:${col(k)}">${esc(k.name)}</b>` : ''}<span class="w">[${esc(wn)}${e.head ? ' ✸' : ''}]</span><b style="color:${col(v)}">${esc(v.name)}</b>`;
    this.feed.prepend(d);
    while (this.feed.children.length > 6) this.feed.lastChild.remove();
    setTimeout(() => d.classList.add('old'), 5000);
    setTimeout(() => d.remove(), 6500);
  }
  radio(who, text, m) {
    const d = document.createElement('div');
    d.className = 'rd';
    const sq = who.brain ? who.brain.squad.name : '';
    d.innerHTML = `<span class="sq" style="color:${TEAM_LOOK[who.team].css}">${esc(sq)}</span> <b>${esc(who.name)}</b> <span class="role">${who.role}</span>: ${esc(text)}`;
    this.radioEl.append(d);
    while (this.radioEl.children.length > 5) this.radioEl.firstChild.remove();
    setTimeout(() => d.classList.add('old'), 4500);
    setTimeout(() => d.remove(), 5500);
  }
  popup(text) {
    const d = document.createElement('div'); d.className = 'pop'; d.textContent = text;
    this.pops.append(d);
    while (this.pops.children.length > 4) this.pops.firstChild.remove();
    setTimeout(() => d.remove(), 1600);
  }
  banner(text, sub = '', color = '#fff', dur = 2.6) {
    const b = $('banner'); b.querySelector('b').textContent = text; b.querySelector('span').textContent = sub; b.style.color = color;
    b.classList.remove('on'); void b.offsetWidth; b.classList.add('on');
    this.bannerT = dur;
  }
  addArc(from) {
    const d = document.createElement('div'); d.className = 'arc';
    $('dmg').append(d);
    this.dmgArcs.push({ el: d, x: from.x, z: from.z, t: 1.6 });
  }
  // ------------------------------------------------------------------ per frame
  update(dt, m, p, cam, ctl) {
    if (!this.visible) return;
    this.consume(m, p);
    const t = m.time;
    // tickets / points / clock
    if (m.mode !== 'waves') {
      for (const k of [0, 1]) { $('tk' + k).textContent = m.tickets[k]; $('tb' + k).style.width = (m.tickets[k] / (m.o.tickets || 200) * 100) + '%'; }
      for (const pt of m.points) {
        const el = $('pt' + pt.id); if (!el) continue;
        const fg = el.querySelector('.fg');
        fg.style.strokeDashoffset = 100.5 * (1 - Math.abs(pt.prog));
        fg.style.stroke = pt.prog >= 0 ? TEAM_LOOK[0].css : TEAM_LOOK[1].css;
        el.className = 'pt ' + (pt.owner === 0 ? 'o0' : pt.owner === 1 ? 'o1' : 'on') + (pt.contested ? ' ct' : '') + (p && p.alive && Math.hypot(p.pos.x - pt.x, p.pos.z - pt.z) < pt.r ? ' in' : '');
      }
      const rt = Math.max(0, m.roundTime);
      $('clock').textContent = m.phase === 'countdown' ? 'DEPLOYING ' + Math.ceil(m.phaseT) : `${Math.floor(rt / 60)}:${String(Math.floor(rt % 60)).padStart(2, '0')}`;
    } else {
      $('wave').innerHTML = (m.waveState === 'live' ? `WAVE <b>${m.wave}</b>/10 · <b>${m.enemiesLeft ?? '?'}</b> HOSTILES LEFT` : m.phase === 'countdown' || m.waveState === 'pre' ? `FIRST WAVE IN <b>${Math.ceil(Math.max(0, m.waveT + (m.phase === 'countdown' ? m.phaseT : 0)))}</b>` : `NEXT WAVE IN <b>${Math.ceil(m.waveT)}</b>`) + ` · LIVES <b>${m.lives}</b>`;
    }
    const spectate = !p;
    $('spec').style.display = spectate ? '' : 'none';
    for (const id of ['xh', 'hp', 'ammo', 'nade']) $(id).style.display = spectate || !p.alive || (p.downed && id !== 'hp') ? 'none' : '';
    if (spectate) { $('obj').style.display = 'none';
      $('scope').style.display = 'none'; $('optic').style.display = 'none'; $('downed').style.display = 'none'; $('prompt').style.display = 'none'; this.drawMini(m, ctl && ctl.follow, cam); this.updateFeedFade(dt); return; }
    // crosshair spread
    const s = p.w.s;
    const moveK = clamp(p.speedNow / 4.7, 0, 1.5);
    const spread = (s.spread.hip + (s.spread.ads - s.spread.hip) * p.adsK) + moveK * s.spread.move + p.bloom;
    const px = clamp(spread * innerHeight / cam.fov * 0.9, 3, 120);
    const xh = $('xh');
    xh.style.setProperty('--g', px + 'px');
    xh.style.opacity = p.adsK > 0.6 || p.sprinting ? 0 : 1;
    xh.classList.toggle('melee', s.mode === 'melee');
    // hit marker
    this.hitT = Math.max(0, this.hitT - dt);
    const hm = $('hm'); hm.style.opacity = this.hitT > 0 ? 1 : 0; hm.className = this.hitKill ? 'kill' : this.hitHead ? 'head' : '';
    // vignettes
    this.vigT = Math.max(0, this.vigT - dt * 0.8);
    const hpk = p.hp / p.maxHp;
    $('vig').style.opacity = Math.max(this.vigT, p.alive && !p.downed ? (1 - hpk) * 0.7 : 0);
    this.supT = Math.max(0, this.supT - dt * 0.7);
    $('supv').style.opacity = this.supT * 0.8;
    // damage arcs
    for (let i = this.dmgArcs.length - 1; i >= 0; i--) {
      const a = this.dmgArcs[i]; a.t -= dt;
      if (a.t <= 0) { a.el.remove(); this.dmgArcs.splice(i, 1); continue; }
      const ang = angDiff(p.yaw, yawTo(a.x - p.pos.x, a.z - p.pos.z));
      a.el.style.transform = `translate(-50%,-50%) rotate(${-ang}rad) translateY(-120px)`;
      a.el.style.opacity = Math.min(1, a.t);
    }
    // health / ammo
    $('hpb').style.width = (Math.max(0, hpk) * 100) + '%';
    $('hpb').style.background = hpk < 0.35 ? '#ff4a3a' : '#e8f0f0';
    $('hpn').textContent = Math.max(0, Math.ceil(p.hp));
    const w = p.w;
    $('wname').textContent = WEAPONS[w.id].name + (w.att.length ? '  ·  ' + w.att.map((a) => a.toUpperCase()).join(' ') : '');
    $('mag').textContent = s.mode === 'melee' ? '—' : w.mag;
    $('mag').className = s.mode !== 'melee' && w.mag <= Math.ceil(s.mag * 0.25) ? 'low' : '';
    $('res').textContent = s.mode === 'melee' ? '' : '/ ' + w.reserve + (p.reloadT > 0 ? '  RELOADING' : w.mag === 0 && w.reserve === 0 ? '  NO AMMO' : '');
    $('slots').innerHTML = p.slots.map((sl, i) => sl ? `<span class="${i === p.cur ? 'on' : ''}">${i + 1} ${WEAPONS[sl.id].short}</span>` : '').join('');
    $('nade').innerHTML = `<span>G</span> ${p.grenadeType.toUpperCase()} ×${p.grenades}`;
    // scope
    const hasOptic = s.att.includes('scope') || s.builtInScope;
    const scoped = hasOptic && s.zoom >= 3.5 && p.adsK > 0.9;
    $('scope').style.display = scoped ? 'block' : 'none';
    $('optic').style.display = hasOptic && !scoped && p.adsK > 0.9 ? 'block' : 'none';
    // interaction prompt
    const pr = $('prompt');
    pr.textContent = ctl ? ctl.prompt || '' : '';
    pr.style.display = pr.textContent ? 'block' : 'none';
    // downed
    const dn = $('downed');
    dn.style.display = p.alive && p.downed ? 'block' : 'none';
    if (p.downed) { $('downt').textContent = `Bleeding out ${Math.max(0, Math.ceil(14 - p.downT))}s`; $('revb').style.width = ((p.reviveProg || 0) * 100) + '%'; }
    this.drawMini(m, p, cam);
    this.objMarker(m, p, cam);
    this.updateTips(dt, m);
    this.updateFeedFade(dt);
  }
  updateFeedFade() { this.bannerT -= 1 / 60; }
  drawMini(m, p, cam) {
    const g = this.mctx, S = 200;
    const [sx, sz] = this.miniScale;
    const W = m.def.w, D = m.def.d;
    const cx = p ? p.pos.x : 0, cz = p ? p.pos.z : 0;
    const yaw = p ? p.yaw : 0;
    const zoom = 1.6;
    g.save();
    g.clearRect(0, 0, S, S);
    g.beginPath(); g.arc(S / 2, S / 2, S / 2 - 2, 0, 7); g.clip();
    g.fillStyle = '#1a201c'; g.fillRect(0, 0, S, S);
    g.translate(S / 2, S / 2);
    g.rotate(yaw);
    g.scale(zoom, zoom);
    g.drawImage(this.miniBase, -(cx + W / 2) * sx, -(cz + D / 2) * sz);
    const tp = (x, z) => [(x - cx) * sx, (z - cz) * sz];
    // points
    for (const pt of m.points) {
      const [x, y] = tp(pt.x, pt.z);
      g.strokeStyle = pt.owner === 0 ? TEAM_LOOK[0].css : pt.owner === 1 ? TEAM_LOOK[1].css : '#ddd';
      g.lineWidth = 1.5 / zoom * 1.5; g.beginPath(); g.arc(x, y, pt.r * sx, 0, 7); g.stroke();
      g.save(); g.translate(x, y); g.rotate(-yaw); g.fillStyle = g.strokeStyle; g.font = `bold ${10 / zoom * 1.3}px sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(pt.id, 0, 0); g.restore();
    }
    const pt0 = m.playerTeam;
    for (const s of m.soldiers) {
      if (!s.alive || s === p) continue;
      const friendly = m.mode === 'watch' || s.team === pt0;
      const spotted = !friendly && ((s.spottedT && m.time - s.spottedT < 5) || (m.time - s.lastShot < 1.2 && !s.w.s.suppressed && p && Math.hypot(s.pos.x - p.pos.x, s.pos.z - p.pos.z) < 60));
      if (!friendly && !spotted) continue;
      const [x, y] = tp(s.pos.x, s.pos.z);
      g.fillStyle = s.downed ? '#888' : TEAM_LOOK[s.team].css;
      g.beginPath(); g.arc(x, y, (friendly ? 2.4 : 2.8) / zoom * 1.4, 0, 7); g.fill();
      if (s.downed && friendly) { g.fillStyle = '#7f7'; g.fillRect(x - 0.6, y - 2.2, 1.2, 4.4); g.fillRect(x - 2.2, y - 0.6, 4.4, 1.2); }
    }
    // callout pings
    for (let i = this.spots.length - 1; i >= 0; i--) {
      const s = this.spots[i]; const age = m.time - s.t;
      if (age > 4) { this.spots.splice(i, 1); continue; }
      const [x, y] = tp(s.x, s.z);
      g.strokeStyle = `rgba(255,90,60,${1 - age / 4})`; g.lineWidth = 1;
      g.beginPath(); g.arc(x, y, 3 + age * 3, 0, 7); g.stroke();
    }
    g.restore();
    // player arrow
    g.fillStyle = '#ffe36a';
    g.beginPath(); g.moveTo(S / 2, S / 2 - 7); g.lineTo(S / 2 + 5, S / 2 + 5); g.lineTo(S / 2, S / 2 + 2); g.lineTo(S / 2 - 5, S / 2 + 5); g.fill();
    g.strokeStyle = 'rgba(255,255,255,0.25)'; g.lineWidth = 2; g.beginPath(); g.arc(S / 2, S / 2, S / 2 - 2, 0, 7); g.stroke();
  }
  // death screen with spawn choices
  showDeath(m, info, onSpawn) {
    const d = $('dead');
    const opts = m.respawnOptions(m.playerTeam);
    const k = info.killer;
    d.innerHTML = `<h2>KILLED IN ACTION</h2><p>${k ? `by <b style="color:${TEAM_LOOK[k.team].css}">${esc(k.name)}</b> (${k.role}) with ${WEAPONS[info.weapon] ? WEAPONS[info.weapon].name : String(info.weapon || '').toUpperCase()}` : 'Out of action'}</p>
      <div class="spawns">${opts.map((o) => `<button data-s="${o.id}">${esc(o.label)}</button>`).join('')}</div><p class="cd">Redeploy in <b id="rcd">5</b></p>`;
    d.style.display = 'block';
    d.querySelectorAll('button').forEach((b) => b.onclick = () => { d.querySelectorAll('button').forEach((x) => x.classList.remove('sel')); b.classList.add('sel'); onSpawn(b.dataset.s); });
    const first = d.querySelector('button'); if (first) first.classList.add('sel');
  }
  hideDeath() { $('dead').style.display = 'none'; }
  setDeathCountdown(t) { const e = $('rcd'); if (e) e.textContent = Math.max(0, Math.ceil(t)); }
  board(m, on) {
    const b = $('board');
    if (!on) { b.style.display = 'none'; return; }
    b.style.display = 'block';
    const team = (t) => m.soldiers.filter((s) => s.team === t).sort((a, c) => c.score - a.score).map((s) => `<tr class="${s.isPlayer ? 'me' : ''}${!s.alive ? ' dead' : ''}"><td>${esc(s.name)}</td><td>${s.role}</td><td>${s.kills}</td><td>${s.deaths}</td><td>${s.assists}</td><td>${s.caps}</td><td>${s.revives}</td><td>${s.score}</td></tr>`).join('');
    const hd = '<tr><th>NAME</th><th>ROLE</th><th>K</th><th>D</th><th>A</th><th>CAP</th><th>REV</th><th>SCORE</th></tr>';
    b.innerHTML = `<div class="cols"><div><h3 style="color:${TEAM_LOOK[0].css}">${TEAM_LOOK[0].name}${m.mode !== 'waves' ? ' · ' + m.tickets[0] : ''}</h3><table>${hd}${team(0)}</table></div><div><h3 style="color:${TEAM_LOOK[1].css}">${TEAM_LOOK[1].name}${m.mode !== 'waves' ? ' · ' + m.tickets[1] : ''}</h3><table>${hd}${team(1)}</table></div></div>`;
  }
}
