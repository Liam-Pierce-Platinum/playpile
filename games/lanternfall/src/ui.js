// HTML overlays: title, characters, the Shed, achievements, settings, pause,
// level-up cards, chests, results and the daily share card.
import { UP, FAMS, CHARS, CHAR_ORDER, MAPS, SHED, shedCost, ACH, RUN_LEN } from './data.js';
import { drawIcon, PLAYER } from './sprites.js';
import { fmtTime, fmtNum, makeCanvas, dateKey } from './util.js';

const $ = (h) => { const t = document.createElement('template'); t.innerHTML = h.trim(); return t.content.firstElementChild; };
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

function iconEl(id, px, cls = 'ico') {
  const c = makeCanvas(px * 2, px * 2); c.className = cls; c.style.width = px + 'px'; c.style.height = px + 'px';
  drawIcon(c.getContext('2d'), id, px * 2);
  return c;
}
function portrait(key, px, locked) {
  const pf = PLAYER[key], c = makeCanvas(px * 2, px * 2), g = c.getContext('2d');
  c.className = 'portrait'; c.style.width = px + 'px'; c.style.height = px + 'px';
  const gr = g.createRadialGradient(px, px * 1.1, 0, px, px * 1.1, px);
  const col = key === 'witch' ? '150,255,140' : '255,200,110';
  gr.addColorStop(0, `rgba(${col},${locked ? 0.15 : 0.55})`); gr.addColorStop(1, `rgba(${col},0)`);
  g.fillStyle = gr; g.fillRect(0, 0, px * 2, px * 2);
  const s = (px * 2) / 52 * 0.95;
  g.drawImage(pf.frames[0], 0, 0, pf.frames[0].width, pf.frames[0].height, px - pf.ax * s, px * 1.88 - pf.ay * s, pf.w * s, pf.h * s);
  // lantern
  g.fillStyle = key === 'witch' ? '#b8ff9a' : '#ffe7a0';
  g.fillRect(px + pf.hand[0] * s - 3.4 * s, px * 1.88 + (pf.hand[1] + 4) * s, 6.8 * s, 7.5 * s);
  if (locked) { g.globalCompositeOperation = 'source-atop'; g.fillStyle = 'rgba(10,8,20,0.92)'; g.fillRect(0, 0, px * 2, px * 2); }
  return c;
}

export class UI {
  constructor(app) {
    this.app = app; this.root = document.getElementById('ui'); this.screen = null; this.lock = 0; this.keyLock = 0; this.keyFns = null;
    this.toasts = []; this.toastEl = null;
    window.addEventListener('keydown', (e) => this.onKey(e));
  }
  clear() { this.root.innerHTML = ''; this.screen = null; this.keyFns = null; }
  // Mis-tap protection is a short lock on POINTER clicks only (150 ms, the cards are still flipping in); keys are
  // never locked, so P-P untoggles pause instantly and Space confirms a chest the moment it is readable. The one
  // exception is the result card (keyLock), where a stray press would cost a run.
  show(el, name, keys) { this.root.innerHTML = ''; this.root.appendChild(el); this.screen = name; this.keyFns = keys || null; this.lock = performance.now() + 150; this.keyLock = 0; }
  onKey(e) {
    if (!this.keyFns) return;
    if (e.repeat) return;
    const f = this.keyFns[e.code] || this.keyFns[e.key];
    if (f && performance.now() > this.keyLock) { e.preventDefault(); f(); }
  }
  btn(el, sel, fn) { const b = el.querySelector(sel); if (b) b.addEventListener('click', (ev) => { ev.stopPropagation(); if (performance.now() < this.lock) return; this.app.audio.play('click'); fn(ev); }); return b; }
  // Toasts: one at a time from a queue, 2.2 s each, parked out of the play area (top-right on desktop, under the
  // timer on phones) and held back while a boss banner is on screen. Mid-run achievements are the name only; the
  // result card carries the reward line.
  toast(title, sub) {
    if (this.app.mode === 'result' && /^Achievement/.test(title)) return;  // the result card lists them
    if (this.app.mode === 'run' && /^Achievement/.test(title)) sub = '';
    this.toasts.push({ title, sub });
    if (!this.toastEl) this.pumpToast();
  }
  pumpToast() {
    const g = this.app.game;
    if (this.toastEl) return;
    if (!this.toasts.length) return;
    if (g && g.banner && g.banner.big && g.banner.t < 2.6 && g.state === 'play') { setTimeout(() => this.pumpToast(), 400); return; }
    const { title, sub } = this.toasts.shift();
    const t = this.toastEl = $(`<div class="toast"><b>${esc(title)}</b>${sub ? `<span>${esc(sub)}</span>` : ''}</div>`);
    document.body.appendChild(t);
    setTimeout(() => t.classList.add('out'), 2200);
    setTimeout(() => { t.remove(); if (this.toastEl === t) this.toastEl = null; this.pumpToast(); }, 2600);
  }

  // ---------------- in-run HUD buttons ----------------
  hud() {
    const el = $(`<div class="hudwrap"><button class="pausebtn" aria-label="Pause"><i></i><i></i></button></div>`);
    this.btn(el, '.pausebtn', () => this.app.pause());
    this.show(el, 'hud', { KeyP: () => this.app.pause(), Escape: () => this.app.pause() });
    this.lock = 0;
  }

  // ---------------- title ----------------
  title() {
    const s = this.app.save, sel = s.sel, ch = CHARS[sel.char], mp = MAPS[sel.map];
    const moonOk = !!s.ach.marshdawn;
    const today = dateKey(), dailyDone = s.daily.scores[today] !== undefined;
    const el = $(`<div class="scrim title">
      <div class="logo"><h1>Lanternfall</h1><p>Carry the last lantern through the haunted forest. Survive until dawn.</p></div>
      <div class="tmenu">
        <button class="btn big go">Light the lantern <small>Space</small></button>
        <div class="selrow">
          <button class="chip ch"><span class="cap">Bearer</span><b>${esc(ch.name)}</b></button>
          <button class="chip mp"><span class="cap">Map</span><b>${esc(mp.name)}</b></button>
          <button class="chip mo ${moonOk ? '' : 'locked'} ${sel.moonless && moonOk ? 'on' : ''}"><span class="cap">Mode</span><b>${moonOk ? (sel.moonless ? 'Moonless' : 'Moonlit') : 'Moonless (locked)'}</b></button>
        </div>
        <div class="row3">
          <button class="btn daily">Daily ${s.daily.streak ? `<small>${s.daily.streak} day streak</small>` : dailyDone ? '<small>played today</small>' : '<small>new</small>'}</button>
          <button class="btn shed">Shed <small>${fmtNum(s.oil)} oil</small></button>
        </div>
        <div class="row3">
          <button class="btn sm ach">Achievements <small>${Object.keys(s.ach).length}/${ACH.length}</small></button>
          <button class="btn sm opt">Sound &amp; options</button>
        </div>
      </div>
      <div class="credit">WASD / arrows, hold the mouse, or drag a thumb anywhere · everything fires by itself</div>
    </div>`);
    el.querySelector('.mo b').textContent = moonOk ? (sel.moonless ? 'Moonless' : 'Moonlit') : 'Moonless (locked)';
    this.btn(el, '.go', () => this.app.startRun());
    this.btn(el, '.ch', () => this.chars());
    this.btn(el, '.mp', () => {
      const keys = Object.keys(MAPS), i = keys.indexOf(sel.map), nx = keys[(i + 1) % keys.length];
      if (MAPS[nx].unlock && !s.ach[MAPS[nx].unlock]) { const a = ACH.find((x) => x.id === MAPS[nx].unlock); this.toast(MAPS[nx].name + ' is locked', a.desc); sel.map = 'forest'; }
      else sel.map = nx;
      this.app.persist(); this.title();
    });
    this.btn(el, '.mo', () => { if (!moonOk) { this.toast('Moonless mode is locked', 'Reach dawn on the Fogmarsh.'); return; } sel.moonless = !sel.moonless; this.app.persist(); this.title(); });
    this.btn(el, '.daily', () => this.dailyInfo());
    this.btn(el, '.shed', () => this.shed());
    this.btn(el, '.ach', () => this.achievements());
    this.btn(el, '.opt', () => this.options(() => this.title()));
    this.show(el, 'title', { Space: () => this.app.startRun(), Enter: () => this.app.startRun() });
  }

  chars() {
    const s = this.app.save;
    const el = $(`<div class="scrim"><div class="card wide"><header><h2>Choose a bearer</h2><button class="btn x">✕</button></header><div class="body"><div class="chars"></div></div></div></div>`);
    const box = el.querySelector('.chars');
    for (const k of CHAR_ORDER) {
      const c = CHARS[k], locked = c.unlock && !s.ach[c.unlock];
      const a = c.unlock ? ACH.find((x) => x.id === c.unlock) : null;
      const b = $(`<button class="charc ${locked ? 'locked' : ''} ${s.sel.char === k ? 'sel' : ''}"><div class="pt"></div><div><b>${esc(c.name)} <i>${esc(c.title)}</i></b><p>${locked ? 'Locked: ' + esc(a.desc) : esc(c.blurb)}</p><small>${locked ? '' : `Health ${c.hp} · Speed ${c.spd}${s.stats.dawnChars[k] ? ' · reached dawn' : ''}`}</small></div></button>`);
      b.querySelector('.pt').appendChild(portrait(k, 64, locked));
      b.addEventListener('click', () => { if (locked) { this.toast(c.name + ' is locked', a.desc); return; } s.sel.char = k; this.app.persist(); this.app.audio.play('click'); this.title(); });
      box.appendChild(b);
    }
    this.btn(el, '.x', () => this.title());
    this.show(el, 'chars', { Escape: () => this.title() });
  }

  shed() {
    const s = this.app.save;
    const el = $(`<div class="scrim"><div class="card wide"><header><h2>The Lamplighter's Shed</h2><span class="oil"><i></i>${fmtNum(s.oil)} oil</span><button class="btn x">✕</button></header><div class="body"><p class="note top">Embers you gather become Oil. Spend it on small permanent upgrades. The Daily ignores these, so everyone starts equal.</p><div class="shedgrid"></div></div></div></div>`);
    const grid = el.querySelector('.shedgrid');
    for (const n of SHED) {
      const tier = s.shed[n.id] || 0, max = tier >= 5, cost = max ? 0 : shedCost(n, tier), afford = s.oil >= cost;
      const b = $(`<button class="node ${max ? 'max' : ''} ${!max && !afford ? 'poor' : ''}"><div class="ni"></div><div class="nt"><b>${esc(n.name)}</b><span>${esc(n.per)}</span><div class="pips">${[0, 1, 2, 3, 4].map((i) => `<i class="${i < tier ? 'on' : ''}"></i>`).join('')}</div></div><em>${max ? 'MAX' : fmtNum(cost)}</em></button>`);
      b.querySelector('.ni').appendChild(iconEl(n.icon, 40));
      b.addEventListener('click', () => {
        if (max) return;
        if (!afford) { this.app.audio.play('warn'); b.classList.remove('shake'); void b.offsetWidth; b.classList.add('shake'); return; }
        s.oil -= cost; s.shed[n.id] = tier + 1; this.app.persist(); this.app.audio.play('pick'); this.shed();
      });
      grid.appendChild(b);
    }
    this.btn(el, '.x', () => this.back());
    this.show(el, 'shed', { Escape: () => this.back() });
  }
  back() { if (this.app.lastResult && this.app.mode === 'result') this.result(this.app.lastResult, this.app.lastExtra); else this.title(); }

  achievements() {
    const s = this.app.save;
    const el = $(`<div class="scrim"><div class="card wide"><header><h2>Achievements</h2><button class="btn x">✕</button></header><div class="body"><div class="achs"></div></div></div></div>`);
    const box = el.querySelector('.achs');
    for (const a of ACH) {
      const got = !!s.ach[a.id];
      box.appendChild($(`<div class="achr ${got ? 'got' : ''}"><span class="mark">${got ? '✓' : ''}</span><div><b>${esc(a.name)}</b><span>${esc(a.desc)}</span>${a.reward ? `<em>${esc(a.reward)}</em>` : ''}</div></div>`));
    }
    const st = s.stats;
    box.appendChild($(`<p class="note">Runs ${st.runs} · Enemies burned ${fmtNum(st.kills)} · Dawns ${st.dawns} · Best score ${fmtNum(st.bestScore)}</p>`));
    this.btn(el, '.x', () => this.title());
    this.show(el, 'ach', { Escape: () => this.title() });
  }

  options(back) {
    const o = this.app.save.opt;
    const el = $(`<div class="scrim"><div class="card small pausec"><header><h2>Sound &amp; options</h2><button class="btn x">✕</button></header><div class="body">${this.optRows(o)}</div></div></div>`);
    this.bindOpts(el);
    this.btn(el, '.x', back);
    this.show(el, 'opts', { Escape: back });
  }
  optRows(o) {
    return `<label class="set">Music <input type="range" min="0" max="1" step="0.05" class="mv" value="${o.music}"></label>
      <label class="set">Effects <input type="range" min="0" max="1" step="0.05" class="sv" value="${o.sfx}"></label>
      <label class="set">Mute everything <input type="checkbox" class="mu" ${o.muted ? 'checked' : ''}></label>
      <label class="set">Screen shake <input type="checkbox" class="sh" ${o.shake ? 'checked' : ''}></label>
      <label class="set">Damage numbers <input type="checkbox" class="nu" ${o.numbers ? 'checked' : ''}></label>`;
  }
  bindOpts(el) {
    const o = this.app.save.opt, a = this.app.audio;
    const ap = () => { a.music = o.music; a.sfx = o.sfx; a.muted = o.muted; a.apply(); this.app.persist(); };
    el.querySelector('.mv').addEventListener('input', (e) => { o.music = +e.target.value; ap(); });
    el.querySelector('.sv').addEventListener('input', (e) => { o.sfx = +e.target.value; ap(); a.play('ember', 1.2); });
    el.querySelector('.mu').addEventListener('change', (e) => { o.muted = e.target.checked; ap(); });
    el.querySelector('.sh').addEventListener('change', (e) => { o.shake = e.target.checked; ap(); });
    el.querySelector('.nu').addEventListener('change', (e) => { o.numbers = e.target.checked; ap(); });
  }

  // ---------------- pause ----------------
  pause(g) {
    const el = $(`<div class="scrim"><div class="card small pausec"><header><h2>Paused</h2><span class="ptime">${fmtTime(g.time)}</span></header><div class="body">
      <div class="build"></div>
      <div class="menu"><button class="btn red res">Resume <small>P</small></button><button class="btn rst">Restart <small>R</small></button></div>
      ${this.optRows(this.app.save.opt)}
      <div class="menu"><button class="btn sm quit">Give up and return to the title</button></div></div></div></div>`);
    const b = el.querySelector('.build');
    for (const id of [...g.actives, ...g.passives]) { const w = $(`<span class="bi"></span>`); w.appendChild(iconEl(id, 30)); w.appendChild($(`<small>${UP[id].kind === 'evo' ? '★' : g.items[id]}</small>`)); w.title = UP[id].name; b.appendChild(w); }
    if (!b.children.length) b.appendChild($('<p class="note">No gifts yet.</p>'));
    this.bindOpts(el);
    this.btn(el, '.res', () => this.app.resume());
    this.btn(el, '.rst', () => this.app.restart());
    this.btn(el, '.quit', () => this.app.quit());
    this.show(el, 'pause', { KeyP: () => this.app.resume(), Escape: () => this.app.resume(), KeyR: () => this.app.restart() });
  }

  // ---------------- level-up ----------------
  levelUp(g, cards) {
    this.cards = cards; this.banishMode = false;
    const el = $(`<div class="scrim lvl"><div class="lvhead"><h2>The light grows</h2><p>Level ${g.level - g.pendingLv + 1} · choose a gift</p></div><div class="cards"></div>
      <div class="lvbtns"><button class="btn sm rr">Reroll <small>${g.rerolls}</small></button><button class="btn sm bn">Banish <small>${g.banishes}</small></button><button class="btn sm sk">Skip</button></div></div>`);
    const box = el.querySelector('.cards');
    cards.forEach((c, i) => box.appendChild(this.cardEl(g, c, i)));
    if (cards.length > 3) box.classList.add('four');
    const pick = (i) => {
      if (!this.cards[i]) return;
      if (this.banishMode) { this.app.banish(i); return; }
      this.app.pick(this.cards[i].id);
    };
    box.querySelectorAll('.ucard').forEach((b, i) => b.addEventListener('click', () => { if (performance.now() < this.lock) return; pick(i); }));
    const rr = this.btn(el, '.rr', () => this.app.reroll());
    const bn = this.btn(el, '.bn', () => { if (g.banishes <= 0) return; this.banishMode = !this.banishMode; el.classList.toggle('banishing', this.banishMode); });
    this.btn(el, '.sk', () => this.app.skip());
    if (g.rerolls <= 0) rr.disabled = true;
    if (g.banishes <= 0) bn.disabled = true;
    this.show(el, 'levelup', { Digit1: () => pick(0), Digit2: () => pick(1), Digit3: () => pick(2), Digit4: () => pick(3), Numpad1: () => pick(0), Numpad2: () => pick(1), Numpad3: () => pick(2), KeyR: () => g.rerolls > 0 && this.app.reroll(), KeyX: () => this.app.skip() });
    cards.forEach((c, i) => setTimeout(() => this.app.audio.play('flip', 1 + i * 0.12), 60 + i * 90));
  }
  cardEl(g, c, i) {
    const d = UP[c.id], fam = FAMS[d.fam];
    const lv = c.lv, isNew = lv === 1 && d.kind !== 'filler';
    let desc = d.kind === 'passive' ? d.desc[0] : (d.desc[lv - 1] || d.desc[0]);
    let kind = d.kind === 'active' ? 'Weapon' : d.kind === 'passive' ? 'Charm' : d.kind === 'lantern' ? 'Lantern' : 'Gift';
    let evo = '';
    if (d.kind === 'active') { const w = UP[d.with]; evo = `Evolves with <b>${esc(w.name)}</b>${g.items[d.with] ? ' ✓' : ''} into ${esc(UP[d.evo].name)}`; }
    if (d.kind === 'passive') { for (const a of g.actives) if (UP[a].with === c.id) evo = `Pairs with your <b>${esc(UP[a].name)}</b> to evolve it`; }
    const el = $(`<button class="ucard" style="--fam:${fam.col};--famink:${fam.ink};--d:${i * 90}ms">
      <span class="key">${i + 1}</span>
      <span class="lvl ${isNew ? 'new' : ''}">${isNew ? 'NEW' : d.kind === 'filler' ? '' : 'LV ' + lv}</span>
      <div class="ic"></div>
      <b class="nm">${esc(d.name)}</b>
      <span class="tag">${esc(fam.name)} · ${kind}</span>
      <p>${esc(desc)}</p>
      ${evo ? `<small class="evo">${evo}</small>` : ''}
      ${d.max < 50 ? `<div class="pips">${Array.from({ length: d.max }, (_, k) => `<i class="${k < lv - 1 ? 'on' : k === lv - 1 ? 'nx' : ''}"></i>`).join('')}</div>` : ''}
    </button>`);
    el.querySelector('.ic').appendChild(iconEl(c.id, 64));
    return el;
  }

  // ---------------- chest ----------------
  // The chest plays itself (lid, rays, the item card flips in) and any tap or key continues; after the first one
  // (which keeps its teaching note) it also closes on its own, the way Vampire Survivors' jackpot does.
  chest(g, res, first) {
    const evo = res[0] && res[0].evo;
    const el = $(`<div class="scrim chestscr"><div class="chestbox ${evo ? 'evo' : ''}">
      <div class="chestart"><div class="lid"></div><div class="body"></div><div class="beams"></div></div>
      <h2>${evo ? 'Evolution!' : res.length > 1 ? res.length + ' gifts!' : 'A chest!'}</h2>
      <div class="loot"></div>
      ${first ? '<p class="note">Chests hold free upgrades. Golden moths and the Grey Stag carry them. A chest can also EVOLVE a weapon: max it out (5 levels) and own its partner charm.</p>' : ''}
      <button class="btn red take">${first ? 'Take it' : 'Continue'} <small>${first ? 'Space' : 'tap anywhere'}</small></button></div></div>`);
    const loot = el.querySelector('.loot');
    res.forEach((r, i) => {
      const d = UP[r.id];
      const row = $(`<div class="lootr" style="--d:${500 + i * 160}ms"><div class="ic"></div><div><b>${esc(d.name)}</b><span>${r.evo ? 'evolved from ' + esc(UP[r.from].name) + '! ' + esc(d.desc[0]) : d.kind === 'filler' ? esc(d.desc[0]) : 'Level ' + r.lv}</span></div></div>`);
      row.querySelector('.ic').appendChild(iconEl(r.id, 48));
      loot.appendChild(row);
    });
    const go = () => { if (this.screen === 'chest') this.app.closeChest(); };
    this.btn(el, '.take', go);
    el.addEventListener('click', () => { if (performance.now() < this.lock) return; go(); });
    this.show(el, 'chest', { Space: go, Enter: go, Digit1: go });
    this.lock = performance.now() + 500;   // the lid is still opening: no accidental skip of the reveal
    if (!first) { const me = el; setTimeout(() => { if (this.root.firstElementChild === me) go(); }, evo ? 3800 : 2600); }
  }

  // ---------------- daily ----------------
  dailyInfo() {
    const d = this.app.dailySetup(), s = this.app.save, today = dateKey();
    const best = s.daily.scores[today];
    const el = $(`<div class="scrim"><div class="card small"><header><h2>Daily run</h2><button class="btn x">✕</button></header><div class="body">
      <p class="dl">${esc(today)}</p>
      <div class="dinfo"><div class="pt"></div><div><b>${esc(CHARS[d.char].name)} ${esc(CHARS[d.char].title)}</b><span>${esc(MAPS[d.map].name)}</span></div></div>
      <p class="note">Everyone gets the same bearer, map, enemy spawns and a fixed pool of gifts today. Shed upgrades are switched off. Score = kills x time x dawn bonus.</p>
      <div class="pool"></div>
      <p class="stk">Streak <b>${s.daily.streak || 0}</b> · best streak ${s.daily.bestStreak || 0}${best !== undefined ? ` · today's best <b>${fmtNum(best)}</b>` : ''}</p>
      <div class="menu"><button class="btn red go">Start today's run</button></div></div></div></div>`);
    el.querySelector('.pt').appendChild(portrait(d.char, 56, false));
    const pool = el.querySelector('.pool');
    for (const id of d.pool) { const w = $('<span class="bi"></span>'); w.title = UP[id].name; w.appendChild(iconEl(id, 26)); pool.appendChild(w); }
    this.btn(el, '.x', () => this.title());
    this.btn(el, '.go', () => this.app.startDaily());
    this.show(el, 'daily', { Escape: () => this.title(), Enter: () => this.app.startDaily(), Space: () => this.app.startDaily() });
  }

  // ---------------- result ----------------
  result(r, extra) {
    const s = this.app.save, dawn = r.dawn;
    const dmg = Object.entries(r.dmgBy).filter(([k]) => k !== 'dawn').sort((a, b) => b[1] - a[1]).slice(0, 6);
    const maxD = dmg.length ? dmg[0][1] : 1;
    const nm = (k) => k === 'lantern' ? 'Lantern burn' : k === 'ignite' ? 'Witchfire' : k === 'pilot' ? 'Pilot wisp' : UP[k] ? UP[k].name : k;
    const el = $(`<div class="scrim result ${dawn ? 'dawn' : 'dark'}"><div class="card wide res">
      <header><h2>${dawn ? (r.bossKilled ? 'Dawn, and the Warden is ash' : 'You reached dawn') : 'The light went out'}</h2>${r.daily ? '<span class="dtag">Daily</span>' : ''}</header>
      <div class="body">
        <div class="score"><span>Score</span><b>${fmtNum(r.score)}</b>${extra.newBest ? '<em>New best!</em>' : `<small>best ${fmtNum(extra.best)}</small>`}</div>
        ${r.killer ? `<p class="killer">Snuffed by ${esc(r.killer.who)} <small>(${fmtNum(r.killer.dmg)} damage)</small></p>` : ''}
        <div class="stats">
          <div><span>Survived</span><b>${fmtTime(r.time)}</b></div>
          <div><span>Burned</span><b>${fmtNum(r.kills)}</b></div>
          <div><span>Level</span><b>${r.level}</b></div>
          <div><span>Oil earned</span><b class="oilv">+${fmtNum(r.oil)}</b></div>
        </div>
        <div class="dmg">${dmg.map(([k, v]) => `<div class="dr"><span class="ic" data-id="${esc(k)}"></span><span class="dn">${esc(nm(k))}</span><span class="bar"><i style="width:${(v / maxD * 100).toFixed(1)}%"></i></span><b>${fmtNum(v)}</b></div>`).join('')}</div>
        ${extra.unlocks.length ? `<div class="unl">${extra.unlocks.map((u) => `<div><b>${esc(u.name)}</b> ${esc(u.reward || u.desc)}</div>`).join('')}</div>` : ''}
        ${r.daily ? `<div class="share"><canvas class="sc"></canvas><div class="row3"><a class="btn sm dl" download="lanternfall-daily.png">Save image</a><button class="btn sm cp">Copy result</button></div></div>` : ''}
        <div class="btns"><button class="btn sm ti">Title</button><button class="btn sm sh">Shed <small>${fmtNum(s.oil)}</small></button><button class="btn red again">Again <small>R</small></button></div>
      </div></div></div>`);
    el.querySelectorAll('.dr .ic').forEach((sp) => { const id = sp.dataset.id; const ic = UP[id] ? id : id === 'pilot' ? 'wisps' : 'lantern'; sp.appendChild(iconEl(ic, 22)); });
    if (r.daily) {
      const c = el.querySelector('.sc'); this.shareCard(c, r, extra);
      try { el.querySelector('.dl').href = c.toDataURL('image/png'); } catch (e) { /* ignore */ }
      this.btn(el, '.cp', () => {
        const txt = `LANTERNFALL Daily ${dateKey()}\n${CHARS[r.char].name} · ${MAPS[r.map].name}\n${r.dawn ? 'Reached dawn' : 'Fell at ' + fmtTime(r.time)} · ${fmtNum(r.kills)} burned · score ${fmtNum(r.score)}\nStreak ${s.daily.streak}`;
        try { navigator.clipboard.writeText(txt).then(() => this.toast('Copied', 'Paste it anywhere.'), () => this.toast('Could not copy', '')); } catch (e) { this.toast('Could not copy', ''); }
      });
    }
    this.btn(el, '.again', () => this.app.again());
    this.btn(el, '.ti', () => this.app.toTitle());
    this.btn(el, '.sh', () => this.shed());
    this.show(el, 'result', { KeyR: () => this.app.again(), Enter: () => this.app.again(), Space: () => this.app.again(), Escape: () => this.app.toTitle() });
    this.lock = this.keyLock = performance.now() + 450;   // the one place a mis-tap costs a run
  }
  shareCard(c, r, extra) {
    c.width = 1200; c.height = 630;
    const g = c.getContext('2d'), s = this.app.save;
    const sky = g.createLinearGradient(0, 0, 0, 630);
    if (r.dawn) { sky.addColorStop(0, '#2a2350'); sky.addColorStop(0.6, '#c8607a'); sky.addColorStop(1, '#ffc27a'); }
    else { sky.addColorStop(0, '#070a14'); sky.addColorStop(1, '#16202a'); }
    g.fillStyle = sky; g.fillRect(0, 0, 1200, 630);
    const gl = g.createRadialGradient(900, 420, 0, 900, 420, 320);
    gl.addColorStop(0, r.char === 'witch' ? 'rgba(150,255,140,0.55)' : 'rgba(255,207,122,0.6)'); gl.addColorStop(1, 'rgba(255,138,61,0)');
    g.fillStyle = gl; g.fillRect(0, 0, 1200, 630);
    // treeline
    g.fillStyle = '#04050a'; g.beginPath(); g.moveTo(0, 630);
    for (let i = 0; i <= 40; i++) g.lineTo(i * 30, 520 - (i % 2 ? 60 : 10) - ((i * 37) % 40));
    g.lineTo(1200, 630); g.fill();
    const pf = PLAYER[r.char];
    g.drawImage(pf.frames[0], 840, 300, pf.frames[0].width * 1.4, pf.frames[0].height * 1.4);
    g.fillStyle = '#fff1d6'; g.font = "96px 'Caveat Brush', Georgia, serif"; g.fillText('Lanternfall', 60, 130);
    g.font = "700 34px 'Alegreya', Georgia, serif"; g.fillStyle = '#ffd99a';
    g.fillText('Daily · ' + dateKey(), 64, 186);
    g.fillStyle = '#fff4dc'; g.font = "800 120px 'Alegreya', Georgia, serif"; g.fillText(fmtNum(r.score), 60, 330);
    g.font = "700 34px 'Alegreya', Georgia, serif"; g.fillStyle = '#f0e0c0';
    g.fillText(`${CHARS[r.char].name} · ${MAPS[r.map].name}`, 64, 390);
    g.fillText(`${r.dawn ? 'Reached dawn' : 'Fell at ' + fmtTime(r.time)} · ${fmtNum(r.kills)} burned · level ${r.level}`, 64, 440);
    g.fillText(`Streak ${s.daily.streak} day${s.daily.streak === 1 ? '' : 's'}`, 64, 490);
  }
}
