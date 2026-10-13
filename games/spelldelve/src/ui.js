// DOM UI: HUD, minimap, modals, shop, title, hub, end screen.
import { G, C } from './state.js';
import { SPELLS, RELICS, META, START_SPELLS, LAST_FLOOR, spellStats, modLabel } from './data.js';
import { buyShop, leaveShop, buyMeta, buyStartSpell, newRun, equip, hexCss, persist } from './game.js';
import { Audio, sfx } from './audio.js';
import { TS } from './util.js';
import { T } from './dungeon.js';

const $ = (id) => document.getElementById(id);
const VS = '︎';
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const KEYS = ['LMB', 'RMB', 'Q', 'E', 'R'];

let last = {};
let miniT = 0;

export const ui = {
  hideAll() { $('screen').className = ''; $('screen').innerHTML = ''; $('modal').classList.add('hidden'); $('shop').classList.add('hidden'); },
  showHud(on) {
    $('hud').classList.toggle('hidden', !on);
    $('touch').classList.toggle('hidden', !on || !isTouch());
    document.body.classList.toggle('touch', isTouch());
    last = {};
  },
  banner(title, sub) {
    const b = $('banner');
    b.classList.add('hidden'); void b.offsetWidth;
    b.querySelector('h2').textContent = title; b.querySelector('p').textContent = sub || '';
    b.classList.remove('hidden');
    // while the big floor title is up, toasts move below it so the two never overlap
    $('toasts').classList.add('low');
    clearTimeout(ui._bt); ui._bt = setTimeout(() => { b.classList.add('hidden'); $('toasts').classList.remove('low'); }, 2700);
  },
  toast(text, color = '#f4ead8', dur = 1.8) {
    const el = document.createElement('div'); el.className = 'toast'; el.style.color = color; el.textContent = text;
    const box = $('toasts'); box.appendChild(el);
    while (box.children.length > 4) box.firstChild.remove();
    setTimeout(() => el.remove(), dur * 1000);
  },
  bossBar(m) {
    $('boss').classList.toggle('hidden', !m);
    if (m) { $('bossname').textContent = m.def.name; $('bossf').style.width = '100%'; }
  },
  bossHp(f) { const w = Math.max(0, f * 100).toFixed(1) + '%'; if (last.boss !== w) { $('bossf').style.width = w; last.boss = w; } },
  hurtFlash() { const h = $('hurt'); h.classList.add('on'); setTimeout(() => h.classList.remove('on'), 60); },
  slotDenied(slot) { const el = $('spellbar').children[slot]; if (el) { el.classList.remove('deny'); void el.offsetWidth; el.classList.add('deny'); } },

  // ---------------------------------------------------------------- per-frame HUD
  update(dt) {
    const P = G.P; if (!P || !G.run) return;
    const set = (k, v, fn) => { if (last[k] !== v) { last[k] = v; fn(v); } };
    set('hp', `${Math.ceil(P.hp)}/${P.maxHp}`, (v) => { $('hpt').textContent = v; $('hpf').style.width = (100 * P.hp / P.maxHp).toFixed(1) + '%'; });
    set('sh', P.shield > 0 ? Math.round(P.shield) : 0, (v) => { $('shf').style.width = Math.min(100, (100 * v) / P.maxHp).toFixed(1) + '%'; });
    set('mp', Math.floor(P.mana) + '/' + P.maxMana, (v) => { $('mpt').textContent = v; $('mpf').style.width = (100 * P.mana / P.maxMana).toFixed(1) + '%'; });
    set('xp', (P.xp / P.xpNext).toFixed(2), (v) => { $('xpf').style.width = v * 100 + '%'; });
    set('lvl', P.level, (v) => { $('lvl').textContent = v; });
    set('gold', P.gold, (v) => { $('gold').textContent = v; });
    set('floor', G.run.floorNum, (v) => { $('floor').textContent = v >= LAST_FLOOR ? 'The Throne' : `Floor ${v} / ${LAST_FLOOR - 1}`; });
    set('relics', [...P.relics].join(), () => { $('relics').innerHTML = [...P.relics].map((r) => `<span title="${esc(RELICS[r].name + ': ' + RELICS[r].desc)}">${RELICS[r].glyph}${VS}</span>`).join(''); });
    set('low', P.hp < P.maxHp * 0.3 && !P.dead, (v) => $('hurt').classList.toggle('low', v));
    // spell bar
    const sb = $('spellbar');
    set('slots', P.slots.join(), () => {
      sb.innerHTML = P.slots.map((id, i) => {
        const s = id && SPELLS[id];
        return `<div class="slot ${i === 0 ? 'prim' : ''} ${s ? '' : 'empty'}"><span class="k">${KEYS[i]}</span><span class="g" style="color:${s ? hexCss(s.hex) : '#888'}">${s ? s.glyph + VS : '+'}</span>${s && s.mana ? `<span class="m">${Math.round(s.mana * P.manaMul)}</span>` : ''}<div class="cd" style="--p:0%"></div><div class="cdt"></div></div>`;
      }).join('');
      for (let i = 1; i <= 4; i++) {
        const id = P.slots[i], tb = $('tb-s' + i);
        if (tb) { tb.textContent = id ? SPELLS[id].glyph + VS : ''; tb.style.color = id ? hexCss(SPELLS[id].hex) : '#555'; tb.style.opacity = id ? 1 : 0.3; }
      }
      const tf = $('tb-fire'); if (tf && P.slots[0]) { tf.textContent = SPELLS[P.slots[0]].glyph + VS; tf.style.color = hexCss(SPELLS[P.slots[0]].hex); }
    });
    P.slots.forEach((id, i) => {
      const el = sb.children[i]; if (!el || !id) return;
      const st = spellStats(id, P.spells[id].mods, P);
      const cd = Math.max(0, P.cds[id] || 0);
      const p = cd > 0 ? Math.min(100, (cd / st.cd) * 100) : 0;
      const key = p.toFixed(0) + (P.mana < st.mana * P.manaMul ? 'n' : '');
      if (el._k === key) return; el._k = key;
      el.querySelector('.cd').style.setProperty('--p', p + '%');
      el.querySelector('.cdt').textContent = cd > 0.5 && i > 0 ? cd.toFixed(cd < 3 ? 1 : 0) : '';
      el.classList.toggle('nomana', P.mana < st.mana * P.manaMul);
    });
    miniT -= dt;
    if (miniT <= 0) { miniT = 0.2; drawMini(); }
  },

  // ---------------------------------------------------------------- modals
  closeModal() { $('modal').classList.add('hidden'); },
  showChoices(title, sub, choices, canReroll) {
    const m = $('modal'), c = $('mcard');
    m.classList.remove('hidden');
    c.innerHTML = `<h2>${esc(title)}</h2><p class="sub">${esc(sub)}</p><div class="choices">${choices.map((o, i) => `
      <button class="choice" data-i="${i}"><span class="g" style="color:${o.color}">${o.glyph}${VS}</span><span class="t">${esc(o.label)}</span><span class="d">${esc(o.sub || '')}</span><span class="p">${i + 1}</span></button>`).join('')}</div>
      ${canReroll && G.run.rerolls > 0 ? `<div class="mbtns"><button class="btn ghost" id="reroll">Reroll (${G.run.rerolls})</button></div>` : ''}`;
    c.querySelectorAll('.choice').forEach((b) => b.onclick = () => G.modalApi && G.modalApi.choose(+b.dataset.i));
    const rr = $('reroll'); if (rr) rr.onclick = () => G.modalApi.reroll();
    keyChoice((i) => i < choices.length && G.modalApi && G.modalApi.choose(i));
  },
  showBook(id) {
    const P = G.P, s = SPELLS[id];
    const m = $('modal'), c = $('mcard');
    m.classList.remove('hidden');
    const slots = s.kind === 'primary' ? [0] : [1, 2, 3, 4];
    c.innerHTML = `<div class="bigglyph" style="color:${hexCss(s.hex)}">${s.glyph}${VS}</div>
      <h2>You learned ${esc(s.name)}!</h2><p class="sub">${esc(s.desc)}${s.mana ? ` &nbsp;·&nbsp; ${s.mana} mana, ${s.cd}s cooldown` : ''}</p>
      <p class="sub" style="margin-bottom:4px">${s.kind === 'primary' ? 'Make it your primary (left click)?' : 'Pick a slot to equip it'}</p>
      <div class="slotpick">${slots.map((i) => { const cur = P.slots[i] && SPELLS[P.slots[i]]; return `<div class="slot ${i === 0 ? 'prim' : ''}" data-s="${i}"><span class="k">${KEYS[i]}</span><span class="g" style="color:${cur ? hexCss(cur.hex) : '#666'}">${cur ? cur.glyph + VS : '+'}</span><span class="n">${cur ? esc(cur.name) : 'empty'}</span></div>`; }).join('')}</div>
      <div class="mbtns"><button class="btn ghost" id="keep">Keep it in the grimoire</button></div>`;
    c.querySelectorAll('.slotpick .slot').forEach((b) => b.onclick = () => G.modalApi.choose(+b.dataset.s));
    $('keep').onclick = () => G.modalApi.choose(-1);
    keyChoice((i) => { const s2 = slots[i]; if (s2 != null) G.modalApi.choose(s2); });
  },
  showGrimoire(onClose) {
    const P = G.P, m = $('modal'), c = $('mcard');
    m.classList.remove('hidden');
    const render = () => {
      c.innerHTML = `<h2>Grimoire</h2><p class="sub">Every spell you know. Equip actives to RMB / Q / E / R.</p><div class="grim">${Object.keys(P.spells).map((id) => {
        const s = SPELLS[id], mods = P.spells[id].mods, eq = P.slots.includes(id);
        const ml = Object.keys(mods).filter((k) => mods[k]).map((k) => `${modLabel(id, k)} x${mods[k]}`).join(' · ');
        const btns = s.kind === 'primary' ? `<button data-id="${id}" data-s="0" class="${P.slots[0] === id ? 'on' : ''}">Primary</button>`
          : [1, 2, 3, 4].map((i) => `<button data-id="${id}" data-s="${i}" class="${P.slots[i] === id ? 'on' : ''}">${KEYS[i]}</button>`).join('');
        return `<div class="gs ${eq ? 'eq' : ''}"><div class="h"><span class="g" style="color:${hexCss(s.hex)}">${s.glyph}${VS}</span>${esc(s.name)}</div><div class="d">${esc(s.desc)}</div><div class="mods">${ml}</div><div class="eqb">${btns}</div></div>`;
      }).join('')}</div>
      <h3 class="sect">Relics</h3><div class="grim">${[...P.relics].map((r) => `<div class="gs"><div class="h"><span class="g" style="color:#ffd36b">${RELICS[r].glyph}${VS}</span>${esc(RELICS[r].name)}</div><div class="d">${esc(RELICS[r].desc)}</div></div>`).join('') || '<div class="d" style="color:var(--dim)">None yet - find them in chests, the shop and boss lairs.</div>'}</div>
      <div class="mbtns"><button class="btn go" id="gclose">Back to it</button></div>`;
      c.querySelectorAll('.eqb button').forEach((b) => b.onclick = () => { equip(b.dataset.id, +b.dataset.s); sfx('click'); render(); });
      $('gclose').onclick = onClose;
    };
    render();
  },
  showPause(onResume, onQuit) {
    const m = $('modal'), c = $('mcard');
    m.classList.remove('hidden');
    c.innerHTML = `<h2>Paused</h2><p class="sub">Floor ${G.run.floorNum} · Level ${G.P.level} · ${G.run.kills} kills</p>
      <div class="mbtns"><button class="btn go" id="pres">Resume</button><button class="btn" id="pmute">${Audio.muted ? 'Unmute' : 'Mute'}</button><button class="btn ghost" id="pquit">Abandon run</button></div>
      <div class="help">${helpHtml()}</div>`;
    $('pres').onclick = onResume; $('pquit').onclick = onQuit;
    $('pmute').onclick = () => { toggleMute(); ui.showPause(onResume, onQuit); };
  },

  // ---------------------------------------------------------------- shop
  showShop() {
    const P = G.P, sh = $('shop');
    sh.classList.remove('hidden');
    sh.innerHTML = `<div class="sc"><h1 class="logo" style="font-size:clamp(30px,6vw,56px)">The Wandering Merchant</h1>
      <p class="tag">Between floor ${G.run.floorNum} and ${G.run.floorNum + 1}</p>
      <div class="shopgold">${P.gold} gold &nbsp; <span style="color:#ff8a8a">HP ${Math.ceil(P.hp)}/${P.maxHp}</span></div>
      <div class="choices">${G.shop.items.map((it, i) => `<button class="choice ${G.shop.sold.has(i) ? 'sold' : ''} ${P.gold < it.price ? 'poor' : ''}" data-i="${i}">
        <span class="g" style="color:${it.color}">${it.glyph}${VS}</span><span class="t">${esc(it.name)}</span><span class="d">${esc(it.desc)}</span>
        <span class="p">${G.shop.sold.has(i) ? 'SOLD' : it.price + ' gold'}</span></button>`).join('')}</div>
      <div class="mbtns"><button class="btn" id="sgrim">Grimoire</button><button class="btn go" id="sgo">Descend to floor ${G.run.floorNum + 1}</button></div></div>`;
    sh.querySelectorAll('.choice').forEach((b) => b.onclick = () => buyShop(+b.dataset.i));
    $('sgo').onclick = () => { if (G.mode === 'shop') leaveShop(); };
    $('sgrim').onclick = () => { if (G.mode === 'shop') ui.showGrimoire(() => { ui.closeModal(); }); };
  },
  hideShop() { $('shop').classList.add('hidden'); },

  // ---------------------------------------------------------------- full screens
  showTitle(onPlay, onHub) {
    const s = $('screen'); s.className = 'on';
    s.innerHTML = `<div class="sc"><h1 class="logo">SPELLDELVE</h1><p class="tag">A wizard. A spellbook. Ten floors of dungeon.</p>
      <div class="menu"><button class="btn go" id="tplay">Delve</button><button class="btn" id="thub">Sanctum (${G.save.gold} gold)</button>
      <button class="btn ghost" id="tmute">${Audio.muted ? 'Sound: off' : 'Sound: on'}</button></div>
      <div class="help">${helpHtml()}</div></div>`;
    $('tplay').onclick = onPlay; $('thub').onclick = onHub;
    $('tmute').onclick = () => { toggleMute(); $('tmute').textContent = Audio.muted ? 'Sound: off' : 'Sound: on'; };
  },
  showHub(onPlay, onBack) {
    const s = $('screen'); s.className = 'on';
    const sv = G.save;
    const render = () => {
      s.innerHTML = `<div class="sc"><h1 class="logo" style="font-size:clamp(34px,7vw,64px)">The Sanctum</h1>
        <p class="tag">Gold from every run is banked here. Spend it to start stronger.</p>
        <div class="bank">${sv.gold} gold banked</div>
        <div class="meta">${Object.keys(META).map((k) => { const d = META[k], l = sv.meta[k] || 0, max = l >= d.max; return `<div class="mu"><div class="t">${d.name}</div><div class="d">${d.desc}</div>
          <div class="pips">${Array.from({ length: d.max }, (_, i) => `<i class="${i < l ? 'on' : ''}"></i>`).join('')}</div>
          <button data-m="${k}" ${max ? 'disabled' : ''}>${max ? 'Maxed' : 'Buy - ' + d.cost(l) + ' gold'}</button></div>`; }).join('')}</div>
        <h3 class="sect">Starting spell</h3>
        <div class="meta">${Object.keys(START_SPELLS).map((id) => { const sp = SPELLS[id], own = sv.unlocked.includes(id), sel = sv.startSpell === id; return `<div class="mu"><div class="t"><span style="color:${hexCss(sp.hex)}">${sp.glyph}${VS}</span> ${sp.name}</div><div class="d">${sp.desc}</div>
          <button data-s="${id}" class="${sel ? 'sel' : ''}">${sel ? 'Selected' : own ? 'Select' : 'Unlock - ' + START_SPELLS[id] + ' gold'}</button></div>`; }).join('')}</div>
        <div class="mbtns" style="margin-top:22px"><button class="btn go" id="hplay">Delve</button><button class="btn ghost" id="hback">Back</button></div>
        <p class="help">Best floor reached: ${sv.bestFloor || 0} · Wins: ${sv.wins || 0} · Runs: ${sv.runs || 0}</p></div>`;
      s.querySelectorAll('[data-m]').forEach((b) => b.onclick = () => { buyMeta(b.dataset.m); render(); });
      s.querySelectorAll('[data-s]').forEach((b) => b.onclick = () => { buyStartSpell(b.dataset.s); render(); });
      $('hplay').onclick = onPlay; $('hback').onclick = onBack;
    };
    render();
  },
  showEnd(r) {
    const s = $('screen'); s.className = 'on';
    const mins = Math.floor(r.time / 60), secs = Math.floor(r.time % 60);
    s.innerHTML = `<div class="sc"><h1 class="logo" style="font-size:clamp(36px,8vw,76px)">${r.won ? 'Victory!' : 'You Fell'}</h1>
      <p class="tag">${r.won ? 'The Hollow Crown shatters. Daylight, at last.' : `Floor ${r.floor} claims another wizard`}</p>
      <div class="endstats"><span>Floor</span><span>${r.floor >= LAST_FLOOR ? 'The Throne' : r.floor}</span><span>Level</span><span>${r.level}</span><span>Kills</span><span>${r.kills}</span>
      <span>Time</span><span>${mins}:${String(secs).padStart(2, '0')}</span><span>Spells</span><span>${r.spells.length}</span><span>Relics</span><span>${r.relics.length}</span>
      <span>Gold banked</span><span style="color:var(--gold)">+${r.banked}${r.won ? ' (incl. 300 victory bonus)' : ''}</span></div>
      <div class="menu"><button class="btn go" id="eagain">Delve again</button><button class="btn" id="ehub">Sanctum (${G.save.gold} gold)</button></div></div>`;
    $('eagain').onclick = () => ui._onAgain && ui._onAgain();
    $('ehub').onclick = () => ui._onHub && ui._onHub();
  },
};

function helpHtml() {
  return `<b>WASD</b> move · <b>Mouse</b> aim · <b>Left click</b> primary spell · <b>Right click / Q / E / R</b> equipped spells<br>
  <b>Space</b> dodge (brief invulnerability) · <b>Tab</b> grimoire · <b>Esc</b> pause · <b>M</b> mute<br>
  Rooms seal until every monster is dead. Red shapes on the floor mean something is about to hit there - move.<br>
  Read spellbooks to learn spells. Level-ups and tomes upgrade them. Gold you carry is banked when the run ends.<br>
  Touch: left thumb moves, right buttons cast (auto-aim).`;
}
export function toggleMute() {
  Audio.setMuted(!Audio.muted);
  G.save.muted = Audio.muted; persist();
  $('b-mute').style.opacity = Audio.muted ? 0.4 : 1;
}
function isTouch() { return 'ontouchstart' in window || navigator.maxTouchPoints > 0; }
let keyHandler = null;
function keyChoice(fn) {
  if (keyHandler) removeEventListener('keydown', keyHandler);
  keyHandler = (e) => {
    if ($('modal').classList.contains('hidden')) { removeEventListener('keydown', keyHandler); keyHandler = null; return; }
    const n = parseInt(e.key, 10);
    if (n >= 1 && n <= 5) { e.preventDefault(); e.stopPropagation(); fn(n - 1); }
  };
  addEventListener('keydown', keyHandler, true);
}

function drawMini() {
  const F = G.F, P = G.P; if (!F || !P) return;
  const cv = $('mini'), g = cv.getContext('2d');
  const W = cv.width, H = cv.height;
  g.clearRect(0, 0, W, H);
  // zoom on a window around the player
  const span = 44, s = W / span;
  const ptx = P.x / TS, pty = P.z / TS;
  const ox = ptx - span / 2, oy = pty - span / 2;
  for (let y = Math.max(0, Math.floor(oy)); y < Math.min(F.H, oy + span + 1); y++)
    for (let x = Math.max(0, Math.floor(ox)); x < Math.min(F.W, ox + span + 1); x++) {
      const i = y * F.W + x;
      if (!G.explored[i] || F.tiles[i] === T.VOID) continue;
      const r = F.roomOf[i];
      let col = r < 0 ? '#5a4a40' : '#8a7a6a';
      if (r >= 0) { const st = F.rooms[r].state; if (st === 'locked') col = '#a04040'; else if (F.rooms[r].type === 'treasure') col = '#9a8040'; }
      if (F.tiles[i] === T.PILLAR) col = '#3a302a';
      if (F.doorAt[i] >= 0) col = F.doors[F.doorAt[i]].open < 0.5 ? '#ff5050' : '#b0a090';
      g.fillStyle = col; g.fillRect((x - ox) * s, (y - oy) * s, s + 0.5, s + 0.5);
    }
  g.fillStyle = '#ff6a5a';
  for (const m of G.monsters) if (!m.dead && m.state !== 'disguised') { const x = (m.x / TS - ox) * s, y = (m.z / TS - oy) * s; g.fillRect(x - 1.5, y - 1.5, 3, 3); }
  if (G.stairs) { const x = (G.stairs.x / TS - ox) * s, y = (G.stairs.z / TS - oy) * s; g.fillStyle = '#b48cff'; g.beginPath(); g.arc(x, y, 4, 0, 7); g.fill(); }
  for (const c of G.chests) if (!c.opened && G.explored[Math.floor(c.z / TS) * F.W + Math.floor(c.x / TS)]) { g.fillStyle = '#ffd36b'; g.fillRect((c.x / TS - ox) * s - 2, (c.z / TS - oy) * s - 2, 4, 4); }
  g.fillStyle = '#ffffff'; g.beginPath(); g.arc(W / 2, H / 2, 3.5, 0, 7); g.fill();
}
