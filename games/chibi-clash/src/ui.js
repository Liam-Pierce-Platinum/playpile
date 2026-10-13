// DOM menus: title, starter pick, hub, zone map, egg shop + reveal, monster box, detail
// (evolve / learn / equip), results, pause. Pixel look via the bundled Press Start 2P font.
import { SPECIES, SPECIES_BY_ID, MOVES, TYPES, RARITY, RARITY_ORDER, ZONES, STARTERS, LEARN, EVOLVE, EGG_COST, EGG10_COST, STRONG, ENDLESS, SPECIES_TYPES } from './data.js';
import { portrait, eggCanvas, moveIcon, sprite } from './sprites.js';
import { lvlOf, formOf, speciesOf, levelProgress, evolveState, evolve, learnState, learn, equip, newMon, pull, statsFor } from './mons.js';
import { sfx, isMuted } from './audio.js';

let G = null; // main game api
const root = () => document.getElementById('ui');
export function initUI(api) { G = api; }

function h(tag, attrs = {}, ...kids) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (k === 'class') e.className = v; else if (k === 'style') e.style.cssText = v;
    else if (k.startsWith('on')) e.addEventListener(k.slice(2), (ev) => { if (k === 'onclick') sfx.click(); v(ev); });
    else if (v !== false && v != null) e.setAttribute(k, v === true ? '' : v);
  }
  for (const c of kids.flat()) if (c != null && c !== false) e.append(c instanceof Node ? c : document.createTextNode(String(c)));
  return e;
}
const typeTag = (t) => h('span', { class: 'tag', style: `background:${TYPES[t].col};color:#1e1426` }, TYPES[t].name);
const rarTag = (r) => h('span', { class: 'tag', style: `background:${RARITY[r].col};color:#1e1426` }, RARITY[r].name);
const ownedSet = () => new Set(G.save.mons.map((m) => m.sp));
const seenSet = () => new Set([...(G.save.seen || []), ...G.save.mons.map((m) => m.sp)]);
function screen(...kids) { const keep = screen.keep; if (!keep) G.toMenu(); screen.keep = false; const r = root(); r.innerHTML = ''; r.className = keep ? 'show dark' : 'show'; r.append(h('div', { class: 'panel' }, ...kids)); r.scrollTop = 0; }
export function hideUI() { const r = root(); r.innerHTML = ''; r.className = ''; }
const coinBar = () => h('div', { class: 'coins' }, h('span', { class: 'coin' }), ` ${G.save.coins}`);
function topBar(title, back) {
  return h('div', { class: 'top' }, back ? h('button', { class: 'btn small', onclick: back }, '< BACK') : h('span'), h('h2', {}, title), coinBar());
}
export function toast(msg) {
  const t = document.getElementById('toast'); t.textContent = msg; t.className = 'show';
  clearTimeout(t._t); t._t = setTimeout(() => (t.className = ''), 1800);
}

// ---------------------------------------------------------------- title / starter
export function showTitle() {
  const mons = ['pipkin', 'sproutle', 'bubbit', 'voltwisp', 'pebblo'].map((s) => portrait(s, 0, 3, 'idle0'));
  screen(
    h('div', { class: 'title' },
      h('div', { class: 'logo' }, 'CHIBI', h('br'), h('span', {}, 'CLASH')),
      h('div', { class: 'lineup' }, mons),
      h('p', { class: 'sub' }, 'Hatch cute monsters. Fight in real time. Evolve them.'),
      h('button', { class: 'btn big', id: 'play', onclick: () => (G.save.mons.length ? showHub() : showStarter()) }, G.save.mons.length ? 'CONTINUE' : 'START'),
      h('p', { class: 'hint' }, 'WASD move - J K L abilities - SPACE dodge - mouse aims'),
    ),
  );
}
export function showStarter() {
  screen(
    h('h2', { class: 'center' }, 'CHOOSE YOUR PARTNER'),
    h('p', { class: 'center sub' }, 'Your first monster is free. Pick one!'),
    h('div', { class: 'starters' }, STARTERS.map((id) => {
      const sp = SPECIES_BY_ID[id];
      return h('button', { class: 'card starter', 'data-sp': id, onclick: () => { newMon(G.save, id); G.persist(); sfx.reveal(1); showHub(); toast(sp.forms[0].name + ' joined you!'); } },
        portrait(id, 0, 4), h('div', { class: 'name' }, sp.forms[0].name), typeTag(sp.type),
        h('div', { class: 'tiny' }, sp.pool.slice(0, 3).map((m) => MOVES[m].name).join(' / ')));
    })),
  );
}

// ---------------------------------------------------------------- hub
export function showHub() {
  G.toMenu();
  const m = G.activeMon();
  const evoReady = G.save.mons.some((x) => evolveState(x).ok);
  screen(
    topBar('CHIBI CLASH'),
    h('div', { class: 'hub' },
      h('div', { class: 'fighter card' },
        portrait(m.sp, m.stage, 4),
        h('div', {}, h('div', { class: 'name' }, formOf(m).name), h('div', { class: 'tiny' }, `Lv ${lvlOf(m)}  -  ${m.xp} XP to spend`), typeTag(speciesOf(m).type), ' ', rarTag(speciesOf(m).rarity),
          h('div', { style: 'margin-top:8px' }, h('button', { class: 'btn small', onclick: () => showDetail(m.uid) }, 'MOVES / EVOLVE'), ' ', h('button', { class: 'btn small', onclick: () => showBox(true) }, 'SWAP')))),
      h('div', { class: 'hubbtns' },
        h('button', { class: 'btn big go', id: 'fight', onclick: showZones }, 'FIGHT!'),
        h('button', { class: 'btn big', id: 'shop', onclick: showShop }, 'EGG SHOP'),
        h('button', { class: 'btn big', id: 'box', onclick: () => showBox(false) }, 'MY MONSTERS', evoReady ? h('span', { class: 'badge' }, '!') : null),
        h('button', { class: 'btn big', id: 'collection', onclick: () => showCollection() }, 'COLLECTION', h('br'), h('span', { class: 'tiny' }, `${ownedSet().size}/${SPECIES.length}`)),
        h('button', { class: 'btn small', onclick: showHelp }, 'HOW TO PLAY'),
      ),
    ),
  );
}

function showHelp() {
  const chart = Object.entries(STRONG).filter(([, v]) => v.length).map(([a, v]) => h('div', { class: 'row' }, typeTag(a), ' beats ', ...v.map((t) => [typeTag(t), ' '])));
  screen(topBar('HOW TO PLAY', showHub),
    h('div', { class: 'help' },
      h('p', {}, 'MOVE: WASD / arrows (phone: left thumb).'),
      h('p', {}, 'ABILITIES: J K L or 1 2 3 (hold to repeat). Left click = ability 1. Phone: the round buttons.'),
      h('p', {}, 'DODGE: SPACE. You are untouchable for a moment.'),
      h('p', {}, 'AIM: mouse. No mouse? You auto-aim at the nearest foe in front of you.'),
      h('p', {}, 'Red circles on the ground = an attack is about to land. Get out!'),
      h('p', {}, 'A red ! over a foe = big attack coming. Dodge it.'),
      h('h3', {}, 'TYPES (x1.5 damage, x0.66 the other way)'), chart,
      h('p', {}, 'Using a move of your own type gives +15%.'),
      h('h3', {}, 'XP'), h('p', {}, 'Wins give XP to the monster that fought. XP raises its level AND is a wallet: spend it to EVOLVE (Lv 5, 150 XP) or LEARN new moves.'),
      h('h3', {}, 'EGGS'), h('p', {}, 'Coins from fights buy eggs. Each egg hatches a random monster. Duplicates turn into XP for the one you own, plus coins.'),
    ));
}

// ---------------------------------------------------------------- zones
export function showZones() {
  const m = G.activeMon();
  screen(topBar('FIGHT', showHub),
    h('div', { class: 'fighter card slim' }, portrait(m.sp, m.stage, 2), h('div', { class: 'name' }, `${formOf(m).name}  Lv ${lvlOf(m)}`), h('button', { class: 'btn small', onclick: () => showBox(true, showZones) }, 'CHANGE')),
    ZONES.slice(0, ENDLESS).map((Z, zi) => {
      const unlocked = zi === 0 || G.save.zones[zi - 1] >= 3;
      const best = G.save.zones[zi];
      return h('div', { class: 'zone card' + (unlocked ? '' : ' locked'), style: `border-color:${Z.ground[0]}` },
        h('div', { class: 'zname', style: `background:${Z.edge}` }, Z.name.toUpperCase(), h('span', { class: 'tiny' }, unlocked ? `  foes Lv ${Z.lvl}+` : '  LOCKED - beat the previous boss')),
        h('div', { class: 'nodes' }, [0, 1, 2, 3].map((s) => {
          const open = unlocked && s <= best + 1, done = s <= best;
          return h('button', { class: 'node' + (done ? ' done' : '') + (open && !done ? ' next' : '') + (s === 3 ? ' boss' : ''), disabled: !open, 'data-z': zi, 'data-s': s, onclick: () => G.startFight(zi, s) },
            s === 3 ? (open ? 'BOSS' : '???') : `${s + 1}`, done ? h('span', { class: 'check' }, '*') : null);
        })),
        s3(zi, unlocked));
    }),
    endlessCard());
  function endlessCard() {
    const Z = ZONES[ENDLESS], unlocked = G.save.zones[ENDLESS - 1] >= 3, wave = G.save.endless || 0;
    return h('div', { class: 'zone card' + (unlocked ? '' : ' locked'), style: `border-color:${Z.ground[0]}` },
      h('div', { class: 'zname', style: `background:${Z.edge}` }, 'ENDLESS ARENA', h('span', { class: 'tiny' }, unlocked ? `  best: wave ${wave}` : '  LOCKED - beat the Gloomwood boss')),
      h('div', { class: 'nodes' },
        h('button', { class: 'node next wide', disabled: !unlocked, id: 'endless', 'data-z': ENDLESS, 'data-s': 0, onclick: () => G.startFight(ENDLESS, 0) }, 'WAVE 1'),
        wave > 0 ? h('button', { class: 'node wide', disabled: !unlocked, id: 'endlesscont', onclick: () => G.startFight(ENDLESS, wave) }, `WAVE ${wave + 1}`) : null),
      unlocked ? h('div', { class: 'tiny' }, 'Waves never stop. Any monster can show up. Every 5th wave is a legendary or epic boss.') : null);
  }
  function s3(zi, unlocked) { if (!unlocked) return null; const b = ZONES[zi].boss; return h('div', { class: 'tiny' }, 'Boss: ', b.title); }
}

// ---------------------------------------------------------------- shop + reveal
export function showShop() {
  const rates = RARITY_ORDER.map((r) => h('div', { class: 'row' }, rarTag(r), ` ${(RARITY[r].rate * 100).toFixed(0)}%  `, h('span', { class: 'tiny' }, `(${SPECIES.filter((s) => s.rarity === r).length} kinds)`)));
  const can1 = G.save.coins >= EGG_COST, can10 = G.save.coins >= EGG10_COST;
  screen(topBar('EGG SHOP', showHub),
    h('div', { class: 'shop' },
      h('div', { class: 'eggs' }, RARITY_ORDER.map((r) => { const c = eggCanvas(r); c.className = 'px'; c.style.width = '72px'; c.style.height = '84px'; return c; })),
      h('div', { class: 'buy' },
        h('button', { class: 'btn big' + (can1 ? ' go' : ''), id: 'pull1', disabled: !can1, onclick: () => doPull(1) }, `HATCH 1`, h('br'), h('span', { class: 'tiny' }, `${EGG_COST} coins`)),
        h('button', { class: 'btn big', id: 'pull10', disabled: !can10, onclick: () => doPull(10) }, `HATCH 10`, h('br'), h('span', { class: 'tiny' }, `${EGG10_COST} coins (1 free)`))),
      h('div', { class: 'card rates' }, h('h3', {}, 'HONEST DROP RATES'), rates,
        h('p', { class: 'tiny' }, 'Every species in a tier is equally likely. Duplicates become XP for the monster you own (40/80/150/300 by rarity) plus 10/20/40/100 coins.')),
      h('div', { class: 'card center' }, h('div', { class: 'tiny' }, `You own ${ownedSet().size} of ${SPECIES.length} species.`), h('button', { class: 'btn small', id: 'shopdex', onclick: () => showCollection(showShop) }, 'OPEN COLLECTION')),
    ));
}
function doPull(n) {
  const res = pull(G.save, n);
  if (!res) { sfx.bad(); toast('Not enough coins - win fights!'); return; }
  G.persist();
  reveal(res, () => showShop());
}

// Egg reveal: wobble, crack x3, flash with rarity beams, monster pops out.
export function reveal(results, done) {
  const best = results.reduce((a, r) => (RARITY_ORDER.indexOf(r.rarity) > RARITY_ORDER.indexOf(a) ? r.rarity : a), 'common');
  const ov = h('div', { class: 'reveal' });
  const cv = h('canvas', { width: 160, height: 120, class: 'px revealcv' });
  const info = h('div', { class: 'revealinfo' });
  const skip = h('button', { class: 'btn small skip' }, 'SKIP');
  ov.append(cv, info, skip);
  document.body.append(ov);
  const x = cv.getContext('2d'); x.imageSmoothingEnabled = false;
  let idx = 0, t = 0, last = performance.now(), cracked = 0, popped = false, finished = false;
  const cur = () => results[idx];
  const tierOf = (r) => RARITY_ORDER.indexOf(r);
  function showInfo() {
    const r = cur(), sp = SPECIES_BY_ID[r.sp];
    info.innerHTML = '';
    info.append(h('div', { class: 'name big', style: `color:${RARITY[r.rarity].col}` }, sp.forms[0].name), h('div', {}, rarTag(r.rarity), ' ', typeTag(sp.type)),
      h('div', { class: 'tiny' }, r.dup ? `Duplicate! +${r.xp} XP to your ${sp.forms[0].name}, +${r.coins} coins` : 'NEW! Added to your monsters.'),
      results.length > 1 ? h('div', { class: 'tiny' }, `${idx + 1} / ${results.length}  -  tap for next`) : h('div', { class: 'tiny' }, 'tap to continue'));
  }
  function next() {
    if (!popped) { t = 2.2; return; }
    idx++;
    if (idx >= results.length) { finish(); return; }
    t = 1.2; cracked = 0; popped = false; info.innerHTML = '';
  }
  function finish() {
    if (finished) return; finished = true;
    if (results.length > 1) {
      info.innerHTML = ''; cv.style.display = 'none';
      info.append(h('div', { class: 'name big' }, 'HATCHED!'), h('div', { class: 'grid10' }, results.map((r) => h('div', { class: 'dexcell', style: `border-color:${RARITY[r.rarity].col}` }, portrait(r.sp, 0, 2), r.dup ? h('div', { class: 'tiny' }, 'DUP') : h('div', { class: 'tiny new' }, 'NEW')))),
        h('button', { class: 'btn', onclick: () => { ov.remove(); done(); } }, 'OK'));
      skip.remove();
    } else { ov.remove(); done(); }
  }
  ov.addEventListener('click', (e) => { if (e.target === skip) { idx = results.length; popped = true; finish(); return; } if (!finished) next(); });
  function frame(now) {
    if (finished || !ov.isConnected) return;
    const dt = Math.min(0.05, (now - last) / 1000); last = now; t += dt;
    const r = cur(); const tier = tierOf(r.rarity);
    const eggR = idx === 0 ? best : r.rarity; // the first egg shows the best rarity of the batch (classic tease)
    x.fillStyle = '#1e1426'; x.fillRect(0, 0, 160, 120);
    const crackAt = [0.5, 1.0, 1.5];
    while (cracked < 3 && t > crackAt[cracked]) { cracked++; sfx.crack(); }
    if (t < 2.0) {
      const wob = Math.sin(t * (10 + cracked * 8)) * (1 + cracked) * (t > 0.3 ? 1 : 0);
      if (cracked >= 2) { // glow beams
        x.fillStyle = RARITY[eggR].col; x.globalAlpha = 0.25;
        for (let i = 0; i < 8; i++) { const a = t * 2 + (i * Math.PI) / 4; x.beginPath(); x.moveTo(80, 64); x.lineTo(80 + Math.cos(a) * 120, 64 + Math.sin(a) * 120); x.lineTo(80 + Math.cos(a + 0.2) * 120, 64 + Math.sin(a + 0.2) * 120); x.fill(); }
        x.globalAlpha = 1;
      }
      x.save(); x.translate(80, 92); x.rotate(wob * 0.05); x.drawImage(eggCanvas(eggR, cracked), -24, -56, 48, 56); x.restore();
    } else {
      if (!popped) { popped = true; sfx.reveal(tier); showInfo(); }
      const k = Math.min(1, (t - 2.0) * 4);
      x.fillStyle = RARITY[r.rarity].col; x.globalAlpha = 0.3;
      for (let i = 0; i < 12; i++) { const a = t * 1.5 + (i * Math.PI) / 6; x.beginPath(); x.moveTo(80, 62); x.lineTo(80 + Math.cos(a) * 140, 62 + Math.sin(a) * 140); x.lineTo(80 + Math.cos(a + 0.15) * 140, 62 + Math.sin(a + 0.15) * 140); x.fill(); }
      x.globalAlpha = 1;
      if (t - 2.0 < 0.12) { x.fillStyle = '#ffffff'; x.fillRect(0, 0, 160, 120); }
      const s = sprite(r.sp, 0, Math.floor(t * 2.4) % 2 ? 'idle1' : 'idle0'), sc = 2;
      const w = s.w * sc * k, hh = s.h * sc * k;
      x.drawImage(s.cv, Math.round(80 - w / 2), Math.round(70 - hh / 2 - Math.abs(Math.sin(t * 4)) * 3), Math.round(w), Math.round(hh));
      for (let i = 0; i < 6; i++) { const a = t * 3 + i; x.fillStyle = i % 2 ? '#ffffff' : RARITY[r.rarity].col; x.fillRect(Math.round(80 + Math.cos(a) * 46), Math.round(62 + Math.sin(a * 1.3) * 34), 2, 2); }
    }
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
}

// ---------------------------------------------------------------- box + detail
export function showBox(pick = false, back = showHub) {
  const mons = [...G.save.mons].sort((a, b) => RARITY_ORDER.indexOf(speciesOf(b).rarity) - RARITY_ORDER.indexOf(speciesOf(a).rarity) || lvlOf(b) - lvlOf(a));
  screen(topBar(pick ? 'PICK A FIGHTER' : 'MY MONSTERS', back),
    h('div', { class: 'boxgrid' }, mons.map((m) => {
      const sp = speciesOf(m), ev = evolveState(m).ok;
      return h('button', { class: 'card mon' + (m.uid === G.save.active ? ' active' : ''), style: `border-color:${RARITY[sp.rarity].col}`, 'data-uid': m.uid,
        onclick: () => { if (pick) { G.save.active = m.uid; G.persist(); back(); } else showDetail(m.uid); } },
        portrait(m.sp, m.stage, 2), h('div', { class: 'name' }, formOf(m).name), h('div', { class: 'tiny' }, `Lv ${lvlOf(m)}  ${m.xp} XP`), typeTag(sp.type),
        ev ? h('span', { class: 'badge' }, 'EVO') : null, m.uid === G.save.active ? h('div', { class: 'tiny gold' }, 'FIGHTER') : null);
    })));
}

export function showDetail(uid, selSlot = 0) {
  const m = G.save.mons.find((x) => x.uid === uid); if (!m) return showBox();
  const sp = speciesOf(m), lp = levelProgress(m), st = statsFor(m.sp, m.stage, lvlOf(m)), ev = evolveState(m);
  const statRow = (k, v, max) => h('div', { class: 'stat' }, h('span', {}, k), h('div', { class: 'sbar' }, h('i', { style: `width:${Math.min(100, (v / max) * 100)}%` })), h('span', {}, Math.round(v)));
  const moveCard = (id, extra) => { const M = MOVES[id]; const ic = moveIcon(M); const c = document.createElement('canvas'); c.width = 14; c.height = 14; c.getContext('2d').drawImage(ic, 0, 0); c.className = 'px'; c.style.width = c.style.height = '28px'; return h('div', { class: 'mv' }, c, h('div', {}, h('div', { class: 'mname' }, M.name, ' ', h('span', { class: 'tiny', style: `color:${TYPES[M.type].col}` }, TYPES[M.type].name)), h('div', { class: 'tiny' }, M.desc, M.power ? `  PWR ${M.power}` : '', `  CD ${M.cd}s`)), extra || null); };
  const next = m.stage ? null : sp.forms[1];
  screen(topBar(formOf(m).name.toUpperCase(), () => showBox()),
    h('div', { class: 'detail' },
      h('div', { class: 'card dleft' },
        portrait(m.sp, m.stage, 4),
        h('div', {}, typeTag(sp.type), ' ', rarTag(sp.rarity)),
        h('div', { class: 'name' }, `Lv ${lp.l}`),
        h('div', { class: 'sbar xp' }, h('i', { style: `width:${(lp.cur / lp.need) * 100}%` })), h('div', { class: 'tiny' }, `${lp.cur}/${lp.need} to next level`),
        h('div', { class: 'xpw' }, `${m.xp} XP`, h('span', { class: 'tiny' }, ' to spend')),
        statRow('HP', st.hp, 260), statRow('ATK', st.atk, 36), statRow('DEF', st.def, 36), statRow('SPD', st.spd, 100),
        h('div', { class: 'evo card' },
          next ? [h('div', { class: 'tiny' }, 'EVOLVES INTO'), portrait(m.sp, 1, 2), h('div', { class: 'name' }, next.name),
            h('button', { class: 'btn' + (ev.ok ? ' go' : ''), id: 'evolve', disabled: !ev.ok, onclick: () => doEvolve(m) }, 'EVOLVE', h('br'), h('span', { class: 'tiny' }, ev.why))]
            : h('div', { class: 'tiny gold' }, 'FULLY EVOLVED'),
        ),
        m.uid === G.save.active ? h('div', { class: 'tiny gold' }, 'CURRENT FIGHTER') : h('button', { class: 'btn small', onclick: () => { G.save.active = m.uid; G.persist(); showDetail(uid); toast(formOf(m).name + ' will fight next'); } }, 'SET AS FIGHTER'),
      ),
      h('div', { class: 'dright' },
        h('h3', {}, 'EQUIPPED (tap a slot, then a move)'),
        h('div', { class: 'slots' }, m.eq.map((id, i) => h('button', { class: 'slot' + (i === selSlot ? ' sel' : ''), 'data-slot': i, onclick: () => showDetail(uid, i) }, h('span', { class: 'key' }, 'JKL'[i]), moveCard(id)))),
        h('h3', {}, 'MOVE POOL'),
        sp.pool.map((id, i) => {
          const known = m.known.includes(id), ls = known ? null : learnState(m, i);
          const btn = known
            ? (m.eq.includes(id) ? h('span', { class: 'tiny gold' }, `SLOT ${'JKL'[m.eq.indexOf(id)]}`) : h('button', { class: 'btn small', onclick: () => { equip(m, id, selSlot); G.persist(); showDetail(uid, selSlot); } }, `EQUIP ${'JKL'[selSlot]}`))
            : h('button', { class: 'btn small' + (ls.ok ? ' go' : ''), 'data-learn': i, disabled: !ls.ok, onclick: () => { if (learn(m, i)) { sfx.level(); G.persist(); if (m.eq.length < 3) { m.eq.push(id); G.persist(); toast('Learned ' + MOVES[id].name + '! Equipped.'); showDetail(uid, selSlot); } else equipPrompt(m, id, () => showDetail(uid, selSlot)); } } }, ls.ok ? `LEARN ${ls.cost} XP` : `LEARN: ${ls.why}${LEARN[i] && ls.why.startsWith('Lv') ? ` ${LEARN[i].cost}XP` : ''}`);
          return h('div', { class: 'pool' + (known ? '' : ' unknown') }, moveCard(id, btn));
        }),
      ),
    ));
}

function doEvolve(m) {
  const fromName = formOf(m).name;
  if (!evolve(m)) return;
  G.persist();
  const ov = h('div', { class: 'reveal' });
  const cv = h('canvas', { width: 160, height: 120, class: 'px revealcv' });
  const info = h('div', { class: 'revealinfo' }, h('div', { class: 'name' }, `What? ${fromName} is evolving!`));
  ov.append(cv, info); document.body.append(ov);
  const x = cv.getContext('2d'); x.imageSmoothingEnabled = false;
  sfx.evolve();
  let t = 0, last = performance.now(), done = false;
  const a = sprite(m.sp, 0, 'idle0'), b = sprite(m.sp, 1, 'idle0');
  function frame(now) {
    if (!ov.isConnected) return;
    const dt = Math.min(0.05, (now - last) / 1000); last = now; t += dt;
    x.fillStyle = '#1e1426'; x.fillRect(0, 0, 160, 120);
    const T = TYPES[speciesOf(m).type];
    for (let i = 0; i < 14; i++) { const ang = t * 2 + i * 0.45, rr = 70 - ((t * 40 + i * 10) % 70); x.fillStyle = i % 2 ? T.light : '#ffffff'; x.fillRect(Math.round(80 + Math.cos(ang) * rr), Math.round(62 + Math.sin(ang) * rr), 2, 2); }
    if (t < 2.6) {
      const rate = 2 + t * t * 3, showB = Math.sin(t * rate * Math.PI) > 0 && t > 0.6;
      const s = showB ? b : a, sc = 2;
      x.drawImage(s.flash, Math.round(80 - (s.w * sc) / 2), Math.round(64 - (s.h * sc) / 2), s.w * sc, s.h * sc);
    } else {
      if (!done) { done = true; sfx.evolved(); info.innerHTML = ''; info.append(h('div', { class: 'name big gold' }, `${fromName} evolved into ${formOf(m).name}!`), h('div', { class: 'tiny' }, 'Bigger, stronger, new look. Tap to continue.')); }
      if (t < 2.75) { x.fillStyle = '#ffffff'; x.fillRect(0, 0, 160, 120); }
      const s = sprite(m.sp, 1, Math.floor(t * 2.4) % 2 ? 'idle1' : 'idle0'), sc = 2;
      x.drawImage(s.cv, Math.round(80 - (s.w * sc) / 2), Math.round(64 - (s.h * sc) / 2), s.w * sc, s.h * sc);
    }
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
  ov.addEventListener('click', () => { if (t < 2.6) { t = 2.6; return; } ov.remove(); showDetail(m.uid); });
}

// A just-learned move: pick the slot it replaces (or keep the current three).
export function equipPrompt(m, id, done) {
  const M = MOVES[id];
  const ov = h('div', { class: 'reveal prompt' });
  const close = () => { ov.remove(); done(); };
  ov.append(h('div', { class: 'card promptcard' },
    h('div', { class: 'name gold' }, `Learned ${M.name}!`),
    h('div', { class: 'tiny' }, M.desc),
    h('div', { class: 'tiny' }, 'Put it in a slot? It replaces that move (you can swap back any time).'),
    h('div', { class: 'row gap' }, m.eq.map((cur, slot) => h('button', { class: 'btn go', 'data-eqslot': slot, onclick: (e) => { e.stopPropagation(); equip(m, id, slot); G.persist(); toast(`${M.name} -> slot ${'JKL'[slot]}`); close(); } },
      'JKL'[slot], h('br'), h('span', { class: 'tiny' }, 'over ' + MOVES[cur].name)))),
    h('button', { class: 'btn small', id: 'eqlater', onclick: (e) => { e.stopPropagation(); close(); } }, 'NOT NOW')));
  document.body.append(ov);
}

// Every species: owned in colour, seen-but-not-owned dimmed, never seen as a black silhouette.
export function showCollection(back = showHub, filter = 'all', pick = null) {
  const owned = ownedSet(), seen = seenSet();
  const list = SPECIES.filter((sp) => filter === 'all' || sp.type === filter);
  const sel = pick && SPECIES_BY_ID[pick];
  const cell = (sp) => {
    const own = owned.has(sp.id), saw = seen.has(sp.id);
    const c = portrait(sp.id, 0, 1.6);
    if (!saw) c.style.filter = 'brightness(0) opacity(0.4)'; else if (!own) c.style.filter = 'grayscale(0.7) opacity(0.75)';
    return h('button', { class: 'dexcell' + (own ? ' own' : saw ? ' seen' : ' unseen') + (sel === sp ? ' sel' : ''), 'data-dex': sp.id, style: `border-color:${RARITY[sp.rarity].col}`,
      onclick: () => showCollection(back, filter, sp.id) },
      c, h('div', { class: 'tiny' }, saw ? sp.forms[0].name : '???'));
  };
  let info = h('div', { class: 'card dexinfo' }, h('div', { class: 'tiny' }, 'Tap a monster for its page. Black ones you have not met yet: find them in zones, the endless arena, or eggs.'));
  if (sel) {
    const own = owned.has(sel.id), saw = seen.has(sel.id);
    info = h('div', { class: 'card dexinfo' },
      saw ? [h('div', { class: 'row' }, portrait(sel.id, 0, 3), h('span', { class: 'gold' }, ' > '), own ? portrait(sel.id, 1, 3) : h('span', { class: 'tiny' }, '(own one to see its evolution)')),
        h('div', { class: 'name' }, sel.forms[0].name, own ? ` > ${sel.forms[1].name}` : ''), h('div', {}, typeTag(sel.type), ' ', rarTag(sel.rarity)),
        h('div', { class: 'tiny' }, own ? 'OWNED' : 'SEEN - not hatched yet'),
        h('div', { class: 'tiny' }, 'Moves: ' + sel.pool.map((id) => MOVES[id].name).join(', '))]
        : [h('div', { class: 'name' }, '???'), h('div', {}, rarTag(sel.rarity)), h('div', { class: 'tiny' }, 'Not seen yet.')]);
  }
  screen(topBar('COLLECTION', back),
    h('div', { class: 'dexhead' },
      h('div', { class: 'name' }, h('span', { id: 'dexseen' }, `SEEN ${seen.size}`), '  /  ', h('span', { id: 'dexowned', class: 'gold' }, `OWNED ${owned.size}`), `  /  ${SPECIES.length}`),
      h('div', { class: 'row filters' }, ['all', ...SPECIES_TYPES].map((t) => h('button', { class: 'btn small' + (t === filter ? ' go' : ''), style: t === 'all' ? '' : `color:${TYPES[t].col}`, onclick: () => showCollection(back, t, null) }, t === 'all' ? 'ALL' : TYPES[t].name)))),
    info,
    h('div', { class: 'dexgrid big' }, list.map(cell)));
}

// ---------------------------------------------------------------- results / pause
export function showResults(r) {
  screen.keep = true;
  const m = G.save.mons.find((x) => x.uid === r.uid);
  const hasNext = r.win && (r.endless || r.stage < 3 || r.zi < ZONES.length - 1);
  const nz = r.endless || r.stage < 3 ? r.zi : r.zi + 1, ns = r.endless || r.stage < 3 ? r.stage + 1 : 0;
  const ev = evolveState(m).ok, learnable = speciesOf(m).pool.some((id, i) => !m.known.includes(id) && learnState(m, i).ok);
  screen(
    h('div', { class: 'results' },
      h('h1', { class: r.win ? 'gold' : 'red' }, r.win ? (r.endless ? `WAVE ${r.stage + 1} CLEARED!` : 'VICTORY!') : 'KNOCKED OUT'),
      r.endless ? h('div', { class: 'tiny gold' }, `Best: wave ${G.save.endless}`) : null,
      portrait(m.sp, m.stage, 4, r.win ? 'atk' : 'hurt'),
      h('div', { class: 'name' }, `${formOf(m).name}  Lv ${lvlOf(m)}`),
      h('div', { class: 'rew' }, h('div', {}, h('span', { class: 'coin' }), ` +${r.coins} coins`), h('div', {}, `+${r.xp} XP`), r.bonus ? h('div', { class: 'gold' }, `FIRST CLEAR BONUS +${r.bonus}`) : null),
      r.levels > 0 ? h('div', { class: 'gold big' }, `LEVEL UP! Lv ${lvlOf(m)}`) : null,
      r.unlocked ? h('div', { class: 'gold' }, ZONES[r.zi + 1].endless ? 'ENDLESS ARENA UNLOCKED!' : `NEW ZONE: ${ZONES[r.zi + 1].name.toUpperCase()}`) : null,
      h('div', { class: 'tiny' }, `Time ${Math.floor(r.time)}s`),
      (ev || learnable) ? h('button', { class: 'btn go', id: 'upgrade', onclick: () => showDetail(m.uid) }, ev ? 'EVOLVE NOW!' : 'LEARN A NEW MOVE') : null,
      h('div', { class: 'row gap' },
        hasNext ? h('button', { class: 'btn go', id: 'next', onclick: () => G.startFight(nz, ns) }, r.endless ? 'NEXT WAVE' : 'NEXT FIGHT') : null,
        h('button', { class: 'btn', id: 'retry', onclick: () => G.startFight(r.zi, r.stage) }, r.win ? 'REPLAY' : 'RETRY'),
        h('button', { class: 'btn', id: 'hub', onclick: showHub }, 'HUB')),
      !r.win ? h('p', { class: 'tiny' }, 'Tip: dodge (SPACE) through red circles, use type advantage, or hatch a new monster.') : null,
    ));
}
export function showPause(resume, quit) {
  screen.keep = true;
  screen(h('div', { class: 'results' }, h('h1', {}, 'PAUSED'),
    h('button', { class: 'btn go', onclick: resume }, 'RESUME'), h('button', { class: 'btn', onclick: quit }, 'GIVE UP'),
    h('p', { class: 'tiny' }, `Sound: ${isMuted() ? 'off' : 'on'} (M or the speaker button)`)));
}
