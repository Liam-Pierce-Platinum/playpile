// Menus: title (with map/mode/difficulty), armory (buy guns + attachments, set loadout,
// live 3D preview), pause, results. Plain DOM, rendered into #ui.
import * as THREE from '../vendor/three.module.js';
import { WEAPONS, ATTACH, GRENADES, PRIMARIES, SECONDARIES, statsFor } from './weapons.js';
import { MAPS } from './maps.js';
import { DIFF } from './ai.js';
import { buildGun } from './models.js';

const $ = (id) => document.getElementById(id);

export class UI {
  constructor(G) {
    this.G = G;
    this.el = $('ui');
    this.panel = null;
    this.armSel = 'ar';
  }
  hide() { document.body.classList.remove('uiopen'); this.el.innerHTML = ''; this.el.style.display = 'none'; this.panel = null; this.stopPreview(); }
  frame(html, cls = '') { document.body.classList.add('uiopen'); this.el.style.display = ''; this.el.className = cls; this.el.innerHTML = html; }
  bind(sel, fn) { this.el.querySelectorAll(sel).forEach((b) => b.addEventListener('click', (e) => { this.G.audio.init(); this.G.audio.ui(); fn(b, e); })); }
  // ------------------------------------------------------------------ title
  title() {
    this.stopPreview();
    this.panel = 'title';
    const M = this.G.meta, d = M.d, rk = M.rank();
    const s = d.settings;
    this.frame(`
      <div class="title">
        <div class="logo"><h1>FRONT<span>LINE</span></h1><p>Low-poly squad warfare against an enemy that thinks</p></div>
        <div class="menu">
          <button class="big" data-go="battle"><b>TEAM BATTLE</b><small>8v8 conquest · capture A B C · tickets</small></button>
          <button class="big" data-go="waves"><b>SKIRMISH</b><small>Solo · survive 10 waves of hunters</small></button>
          <button class="big alt" data-go="watch"><b>WATCH AI BATTLE</b><small>Spectate 8v8 with the AI debug view</small></button>
          <button class="big alt" data-go="armory"><b>ARMORY</b><small>Buy guns, attachments, set your loadout</small></button>
        </div>
        <div class="setup">
          <h4>BATTLEFIELD</h4>
          <div class="maps">${MAPS.map((m) => `<button class="map ${s.map === m.id ? 'sel' : ''}" data-map="${m.id}" style="--c:${m.col}"><b>${m.name}</b><small>${m.sub}</small></button>`).join('')}</div>
          <h4>ENEMY DIFFICULTY</h4>
          <div class="diffs">${Object.entries(DIFF).map(([k, v]) => `<button class="pill ${s.difficulty === k ? 'sel' : ''}" data-diff="${k}">${v.name}</button>`).join('')}</div>
          <p class="dhelp">${this.diffHelp(s.difficulty)}</p>
        </div>
        <div class="profile">
          <div class="rank"><b>${rk.name.toUpperCase()}</b><span>RANK ${rk.lvl + 1}</span></div>
          <div class="xp"><div style="width:${(rk.into / rk.need * 100).toFixed(1)}%"></div></div>
          <div class="cr">${d.credits.toLocaleString()} <small>CREDITS</small></div>
          <div class="lo">${WEAPONS[d.loadout.primary.id].name} · ${WEAPONS[d.loadout.secondary.id].name} · ${GRENADES[d.loadout.grenade].name}</div>
          <div class="st">${d.stats.matches} matches · ${d.stats.wins} wins · ${d.stats.kills} kills${d.stats.waveBest ? ' · best wave ' + d.stats.waveBest : ''}</div>
        </div>
        <div class="foot">WASD move · Mouse aim · LMB fire · RMB aim · R reload · Shift sprint · C/Ctrl crouch · Space jump · 1-4 / wheel weapons · G grenade · V knife · E use / revive · Tab scores · M mute · F3 AI view
          <button class="mute" data-mute>${s.muted ? 'SOUND OFF' : 'SOUND ON'}</button></div>
      </div>`, 'scr-title');
    this.bind('[data-go]', (b) => { const g = b.dataset.go; if (g === 'armory') this.armory(); else this.G.startMatch(g); });
    this.bind('[data-map]', (b) => { d.settings.map = b.dataset.map; M.save(); this.G.menuBackdrop(); this.title(); });
    this.bind('[data-diff]', (b) => { d.settings.difficulty = b.dataset.diff; M.save(); this.title(); });
    this.bind('[data-mute]', () => { d.settings.muted = !d.settings.muted; M.save(); this.G.audio.setMuted(d.settings.muted); this.title(); });
  }
  diffHelp(k) {
    return {
      recruit: 'Slow to react (0.85 s), loose aim, rarely throw grenades.',
      regular: 'Half-second reactions, decent aim, use cover and flank.',
      veteran: 'Fast reactions, tight aim, aggressive grenades and flanks.',
      elite: 'Near-instant reactions, aim for heads, punish every mistake.',
    }[k];
  }
  // ------------------------------------------------------------------ armory
  armory() {
    this.panel = 'armory';
    const M = this.G.meta, d = M.d;
    const sel = this.armSel;
    const w = WEAPONS[sel];
    const owned = M.owns(sel);
    const slot = w.slot === 'secondary' ? 'secondary' : 'primary';
    const equipped = d.loadout[slot].id === sel;
    const curAtt = equipped ? d.loadout[slot].att : (d.equippedAtt?.[sel] || []);
    const st = statsFor(sel, curAtt);
    const row = (id) => {
      const W = WEAPONS[id], o = M.owns(id), eq = d.loadout.primary.id === id || d.loadout.secondary.id === id;
      return `<button class="wrow ${id === sel ? 'sel' : ''} ${o ? '' : 'locked'}" data-w="${id}"><b>${W.name}</b><small>${W.cls}</small>${eq ? '<i class="eq">EQUIPPED</i>' : o ? '' : `<i class="price">${W.price}</i>`}</button>`;
    };
    const bar = (label, v, max, inv = false) => { const k = Math.max(0.03, Math.min(1, v / max)); return `<div class="stat"><span>${label}</span><div class="sb"><div style="width:${(inv ? 1 - k + 0.05 : k) * 100}%"></div></div></div>`; };
    const dps = (st.dmg[0] * (st.pellets || 1)) / st.interval;
    this.frame(`
      <div class="armory">
        <div class="ahead"><h2>ARMORY</h2><div class="cr">${d.credits.toLocaleString()} <small>CREDITS</small></div><p class="earnhelp">Earn credits in every match: kill <b>100</b> · headshot <b>150</b> · capture <b>150</b> · revive <b>75</b> · win <b>600</b> (loss 250). Click a gun to see it, buy it, then EQUIP. Attachments are bought per gun and toggled on/off.</p><button class="back" data-back>BACK</button></div>
        <div class="alist">
          <h4>PRIMARY</h4>${PRIMARIES.map(row).join('')}
          <h4>SECONDARY</h4>${SECONDARIES.map(row).join('')}
          <h4>GRENADE</h4>${Object.values(GRENADES).map((g) => { const o = d.grenades.includes(g.id); return `<button class="wrow ${o ? '' : 'locked'} ${d.loadout.grenade === g.id ? 'sel' : ''}" data-g="${g.id}"><b>${g.name}</b><small>${g.id === 'frag' ? '7 m blast, bounces' : 'Blocks all sight for 15 s'}</small>${d.loadout.grenade === g.id ? '<i class="eq">EQUIPPED</i>' : o ? '' : `<i class="price">${g.price}</i>`}</button>`; }).join('')}
        </div>
        <div class="adetail">
          <canvas id="prev" width="640" height="240"></canvas>
          <h3>${w.name} <small>${w.cls}</small></h3>
          <div class="stats">
            ${bar('DAMAGE', st.dmg[0] * (st.pellets || 1), 130)}
            ${bar('FIRE RATE', st.rpm, 950)}
            ${bar('DPS', dps, 420)}
            ${bar('RANGE', st.range[1], 140)}
            ${bar('ACCURACY (ADS)', 1 / (st.spread.ads + 0.1), 10)}
            ${bar('RECOIL CONTROL', 1 / (st.recoil.v + 0.3), 3)}
            ${bar('MOBILITY', st.speed, 1.08)}
            <div class="nums">MAG ${st.mag} · RELOAD ${st.reload.toFixed(1)}s${st.reloadPer ? '/shell' : ''} · ZOOM ${st.zoom.toFixed(1)}x · ${st.mode.toUpperCase()}${st.pellets ? ' · ' + st.pellets + ' PELLETS' : ''}${st.proj ? ' · ' + st.proj.splash + ' m BLAST' : ''}</div>
          </div>
          <div class="acts">${owned ? (equipped ? '<span class="eqd">EQUIPPED AS ' + slot.toUpperCase() + '</span>' : `<button class="go" data-equip>EQUIP AS ${slot.toUpperCase()}</button>`) : (d.credits < w.price ? `<button class="go buy" disabled>BUY · ${w.price}</button><span class="need">${(w.price - d.credits).toLocaleString()} more credits needed, about ${Math.ceil((w.price - d.credits) / 900)} match${Math.ceil((w.price - d.credits) / 900) > 1 ? 'es' : ''}</span>` : `<button class="go buy" data-buy>BUY · ${w.price}</button>`)}</div>
          ${w.allow.length ? `<h4>ATTACHMENTS</h4><div class="atts">${w.allow.map((a) => {
            const A = ATTACH[a], have = M.ownsAtt(sel, a), on = curAtt.includes(a);
            return `<button class="att ${on ? 'on' : ''} ${have ? '' : 'locked'}" data-att="${a}" ${!owned ? 'disabled' : ''}><b>${A.name}${a === 'scope' && w.builtInScope ? ' (BUILT-IN)' : ''}</b><small>${A.desc}</small><i>${have ? (on ? 'ON' : 'OFF') : A.price}</i></button>`;
          }).join('')}</div>` : '<p class="noatt">No attachments for this weapon.</p>'}
        </div>
      </div>`, 'scr-armory');
    this.bind('[data-back]', () => this.title());
    this.bind('[data-w]', (b) => { this.armSel = b.dataset.w; this.armory(); });
    this.bind('[data-buy]', () => { if (M.buyWeapon(sel)) { this.G.audio.buy(); M.equip(slot, sel); } this.armory(); });
    this.bind('[data-equip]', () => { M.equip(slot, sel); this.armory(); });
    this.bind('[data-att]', (b) => {
      const a = b.dataset.att;
      if (!M.ownsAtt(sel, a)) { if (M.buyAtt(sel, a)) { this.G.audio.buy(); if (!equipped) M.equip(slot, sel); M.toggleAtt(slot, a); } }
      else { if (!equipped) M.equip(slot, sel); M.toggleAtt(slot, a); }
      this.armory();
    });
    this.bind('[data-g]', (b) => { const g = b.dataset.g; if (!d.grenades.includes(g)) { if (M.buyGrenade(g)) this.G.audio.buy(); } if (d.grenades.includes(g)) { d.loadout.grenade = g; M.save(); } this.armory(); });
    this.preview(sel, curAtt);
  }
  preview(id, att) {
    const cv = $('prev');
    if (!cv) return;
    if (!this.pr) {
      const r = new THREE.WebGLRenderer({ canvas: cv, antialias: true, alpha: true });
      r.outputColorSpace = THREE.SRGBColorSpace; r.toneMapping = THREE.ACESFilmicToneMapping;
      const scene = new THREE.Scene();
      scene.add(new THREE.HemisphereLight('#e8f0ff', '#4a3a2a', 1.6));
      const sun = new THREE.DirectionalLight('#fff2dd', 2.4); sun.position.set(2, 3, 2); scene.add(sun);
      const rim = new THREE.DirectionalLight('#7ab0ff', 1.2); rim.position.set(-2, 1, -3); scene.add(rim);
      const cam = new THREE.PerspectiveCamera(30, 640 / 240, 0.01, 20);
      this.pr = { r, scene, cam, cv };
    }
    const P = this.pr;
    if (P.cv !== cv) { P.r.dispose(); this.pr = null; this.preview(id, att); return; }
    if (P.gun) P.scene.remove(P.gun);
    const g = buildGun(id, att);
    const box = new THREE.Box3().setFromObject(g);
    const size = box.getSize(new THREE.Vector3()), c = box.getCenter(new THREE.Vector3());
    g.position.sub(c);
    const holder = new THREE.Group(); holder.add(g);
    P.gun = holder; P.scene.add(holder);
    const L = Math.max(size.z, size.y * 2.2);
    P.cam.position.set(L * 1.25, L * 0.25, 0); P.cam.lookAt(0, 0, 0);
    this.stopPreview(true);
    const t0 = performance.now();
    const loop = () => {
      if (!this.pr || this.panel !== 'armory') return;
      const t = (performance.now() - t0) / 1000;
      holder.rotation.y = Math.sin(t * 0.6) * 0.45; // side-on, muzzle right, gentle sway
      P.r.render(P.scene, P.cam);
      this.prRaf = requestAnimationFrame(loop);
    };
    loop();
  }
  stopPreview(keep) { if (this.prRaf) cancelAnimationFrame(this.prRaf); this.prRaf = 0; if (!keep && this.pr) { this.pr.r.dispose(); this.pr = null; } }
  // ------------------------------------------------------------------ pause
  pause() {
    this.panel = 'pause';
    const s = this.G.meta.d.settings;
    this.frame(`<div class="pause panel">
      <h2>PAUSED</h2>
      <button class="go" data-resume>RESUME</button>
      <label>MOUSE SENSITIVITY <input type="range" min="0.2" max="3" step="0.05" value="${s.sens}" data-sens> <span id="sensv">${s.sens.toFixed(2)}</span></label>
      <label>FIELD OF VIEW <input type="range" min="65" max="100" step="1" value="${s.fov}" data-fov> <span id="fovv">${s.fov}</span></label>
      <label class="chk"><input type="checkbox" ${s.invert ? 'checked' : ''} data-inv> INVERT Y</label>
      <label class="chk"><input type="checkbox" ${s.muted ? 'checked' : ''} data-mt> MUTE</label>
      <label class="chk"><input type="checkbox" ${this.G.debug.on ? 'checked' : ''} data-ai> AI DEBUG VIEW (F3)</label>
      <button data-quit>QUIT TO MENU</button></div>`, 'scr-pause');
    this.bind('[data-resume]', () => this.G.resume());
    this.bind('[data-quit]', () => this.G.quit());
    const sens = this.el.querySelector('[data-sens]');
    sens.oninput = () => { s.sens = +sens.value; $('sensv').textContent = s.sens.toFixed(2); this.G.meta.save(); };
    const fov = this.el.querySelector('[data-fov]');
    fov.oninput = () => { s.fov = +fov.value; $('fovv').textContent = s.fov; this.G.meta.save(); };
    this.el.querySelector('[data-inv]').onchange = (e) => { s.invert = e.target.checked; this.G.meta.save(); };
    this.el.querySelector('[data-mt]').onchange = (e) => { s.muted = e.target.checked; this.G.audio.setMuted(s.muted); this.G.meta.save(); };
    this.el.querySelector('[data-ai]').onchange = (e) => { this.G.debug.set(e.target.checked); };
  }
  // ------------------------------------------------------------------ results
  results(m, rankUp) {
    this.panel = 'results';
    const r = m.reward, p = m.player;
    const won = m.winner === m.playerTeam;
    const title = m.mode === 'waves' ? (won ? 'SURVIVED' : 'OVERRUN') : m.winner === -1 ? 'DRAW' : won ? 'VICTORY' : 'DEFEAT';
    const sub = m.mode === 'waves' ? `Reached wave ${m.wave} of 10` : `Tickets ${m.tickets[0]} – ${m.tickets[1]}`;
    const rk = this.G.meta.rank();
    this.frame(`<div class="results panel ${won ? 'win' : 'loss'}">
      <h1>${title}</h1><p class="sub">${sub}</p>
      <div class="rstats"><div><b>${p ? p.kills : 0}</b><span>KILLS</span></div><div><b>${p ? p.deaths : 0}</b><span>DEATHS</span></div><div><b>${p ? p.assists : 0}</b><span>ASSISTS</span></div><div><b>${r.caps}</b><span>CAPTURES</span></div><div><b>${r.heads}</b><span>HEADSHOTS</span></div><div><b>${r.revives}</b><span>REVIVES</span></div></div>
      <div class="log">${aggregate(r.log).map(([l, n, c]) => `<div><span>${l}${n > 1 ? ' ×' + n : ''}</span><b>+${c}</b></div>`).join('')}</div>
      <div class="earn">+${r.credits.toLocaleString()} CREDITS · +${r.xp.toLocaleString()} XP</div>
      <div class="rank">${rankUp ? '<b class="up">PROMOTED: ' + rk.name.toUpperCase() + '</b>' : rk.name.toUpperCase()}<div class="xp"><div style="width:${(rk.into / rk.need * 100).toFixed(1)}%"></div></div></div>
      <div class="btns"><button class="go" data-again>PLAY AGAIN</button><button data-arm>ARMORY</button><button data-menu>MENU</button></div></div>`, 'scr-results');
    this.bind('[data-again]', () => this.G.startMatch(m.mode));
    this.bind('[data-arm]', () => { this.G.quit(true); this.armory(); });
    this.bind('[data-menu]', () => this.G.quit());
  }
}
function aggregate(log) {
  const m = new Map();
  for (const [l, c] of log) { const k = l; const e = m.get(k) || [l, 0, 0]; e[1]++; e[2] += c; m.set(k, e); }
  return [...m.values()].sort((a, b) => b[2] - a[2]).slice(0, 8);
}
