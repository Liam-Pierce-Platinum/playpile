// BANNERFALL :: ui/warhud.js - the HUD of a war on a huge map (DESIGN.md 15.2).
//   top:     treasury and income per minute, banners used / cap, regions held, the goal and the
//            rival kingdoms (struck through when they fall), the clock, pause and speed.
//   minimap: painted terrain, territory in kingdom colours, castles, forts and villages by state,
//            every squad, the camera's view. Click flies there, drag pans, right-click sends the
//            selection there.
//   right:   the command bar (v1), or a settlement panel (recruit at your castles with a queue,
//            or what a rival seat holds), or the build palette when builders are selected.
//   modal:   the village choice: pillage it for gold or protect and tax it.
import { ICON, UNIT_ICON } from './icons.js';
import { UNIT_TYPES, WAR_RECRUITABLE, TRAIN, ABILITIES } from '../data/units.js';
import { BUILD_TYPES, BUILD_ORDER } from '../data/builds.js';
import { bannerCap, bannersUsed, incomeOf, canRecruitAt } from '../sim/war.js';
import { truceTerms, relation, strength, mood, opinion, PAY_ATTACK, surrenderTerms } from '../sim/diplomacy.js';
import { hostile } from '../sim/factions.js';
import { regionsOf } from '../sim/regions.js';
import { teamHex } from '../render/unitMeshes.js';

const $ = (id) => document.getElementById(id);
const fmt = (t) => { t = Math.max(0, Math.floor(t)); const h = Math.floor(t / 3600); const m = Math.floor((t % 3600) / 60); return (h ? h + ':' + String(m).padStart(2, '0') : m) + ':' + String(t % 60).padStart(2, '0'); };
const g0 = (n) => Math.round(n).toLocaleString('en-GB');
const KIND = { capital: 'Capital', castle: 'Castle', stronghold: 'Fort', village: 'Village', outpost: 'Outpost' };

export function createWarHUD(G) {
  const top = $('top'), bottom = $('bottom'), right = $('right'), left = $('left');
  let sigTop = '', sigBottom = '', sigRight = '', sigLeft = '', sigModal = '';
  const modal = document.createElement('div'); modal.id = 'choice'; $('hud').appendChild(modal);
  const dip = document.createElement('div'); dip.id = 'dip'; dip.className = 'parch'; $('hud').appendChild(dip);
  let sigDip = '';

  // ---------------------------------------------------------------- top bar
  function renderTop() {
    const w = G.world, W = w.war, T = w.teams[0];
    const inc = T.income || incomeOf(w, 0).total, up = T.upkeep || 0, net = inc - up;
    // the MAIN ENEMY objective (LIAM_BRIEF item 6): "Take Varkhal's castles: 1/4"
    const MF = W.main ? W.factions[W.main] : null;
    const mainTaken = MF ? W.mainSeats.filter((id) => { const q = W.settlements.find((x) => x.id === id); return q && q.owner !== W.main; }).length : 0;
    const offers = w.dip ? w.dip.offers.length + w.dip.warn.length : 0;
    const cap = bannerCap(w, 0), used = bannersUsed(w, 0);
    const reg = regionsOf(w, 0), totalReg = W.regions.filter((R) => R.cells).length;
    const rivals = W.slots.filter((s) => s !== 0).map((s) => W.factions[s]);
    const phase = W.realm ? (G.mode === 'prepare' ? 'Deploy your host' : G.mode === 'over' ? 'Battle over' : W.realm.aim) : G.mode === 'prepare' ? 'Founding' : G.mode === 'over' ? 'War over' : W.win === 'capital' ? 'Take a rival capital' : W.win === 'main' && MF ? (MF.alive ? `Take ${MF.short}'s castles: ${mainTaken}/${W.mainSeats.length}` : `${MF.short} has fallen`) : 'Conquest';
    const warn = W.defeatT !== null && W.defeatT !== undefined && !w.result ? `<span class="wave">No castle! ${fmt(60 - (w.t - W.defeatT))}</span>` : '';
    const truces = rivals.map((f) => (w.dip && relation(w, 0, f.slot) ? relation(w, 0, f.slot).state : 'war')).join();
    const sig = [G.mode, Math.round(T.gold), inc, up, used, cap, reg, rivals.map((f) => f.alive).join(), Math.floor(w.t), G.paused, G.speed, warn, phase, truces, offers, T.bankrupt, G.dipOpen].join('|');
    if (sig === sigTop) return;
    sigTop = sig;
    top.innerHTML = `
      <div class="seg parch gold${T.bankrupt ? ' broke' : ''}" title="Treasury. Income ${g0(inc)} g/min, upkeep ${g0(up)} g/min"><span class="coin"></span><b>${g0(T.gold)}</b> g ${G.mode !== 'prepare' ? `<small class="inc${net < 0 ? ' neg' : ''}">${net >= 0 ? '+' : '−'}${g0(Math.abs(net))}/min</small>` : ''}${T.bankrupt ? '<small class="neg">BANKRUPT</small>' : ''}</div>
      <div class="seg parch" title="Banners: squads you can field. Take castles to raise more."><span class="ban"></span><b>${used % 1 ? used.toFixed(1) : used}</b>/${cap}</div>
      <div class="seg parch" title="Regions held"><span class="reg"></span><b>${reg}</b>/${totalReg}</div>
      <div class="seg parch goal"><span class="phase">${phase}</span>${rivals.map((f) => { const R = w.dip ? relation(w, 0, f.slot) : null, tr = R && R.state === 'truce'; return `<span class="rival${f.alive ? '' : ' fallen'}${f.slot === W.main ? ' main' : ''}${tr ? ' truce' : ''}" title="${f.name}${f.slot === W.main ? ' (the main enemy)' : ''}${tr ? ': truce, ' + Math.ceil((R.until - w.t) / 60) + ' min left' : ''}"><i style="background:${teamHex(f.slot).main}"></i>${f.slot === W.main ? '♛ ' : ''}${f.short}${tr ? ' ☮' : ''}</span>`; }).join('')}${G.mode === 'battle' ? `<span class="timer">${fmt(w.t)}</span>` : ''}${warn}</div>
      ${G.mode === 'battle' ? `<div class="seg parch" style="padding:4px 6px;gap:4px">
        <button data-a="pause" title="Pause (Space)" class="${G.paused ? 'on' : ''}" style="width:40px">${G.paused ? ICON.play : ICON.pause}</button>
        <button data-a="speed" data-v="1" class="${G.speed === 1 ? 'on' : ''}" title="Normal (\\)">1×</button>
        <button data-a="speed" data-v="2" class="${G.speed === 2 ? 'on' : ''}" title="Fast (])">2×</button>
        <button data-a="speed" data-v="3" class="${G.speed === 3 ? 'on' : ''}" title="Faster (Shift+])">3×</button>
      </div>` : ''}
      ${G.mode === 'battle' ? `<div class="seg parch" style="padding:4px 6px"><button data-a="dip" class="${G.dipOpen ? 'on' : ''}${offers ? ' hot' : ''}" title="Banners: truces, tribute and politics (U)">⚑ Banners${offers ? ' <b class="badge">' + offers + '</b>' : ''}</button></div>` : ''}
      <div class="seg parch" style="padding:4px 6px"><button data-a="menu" title="Menu (Esc)">☰</button></div>`;
    top.querySelectorAll('button svg').forEach((s) => { s.style.width = '18px'; s.style.height = '18px'; });
  }
  top.addEventListener('click', (e) => {
    if (!G.isWar()) return;
    const b = e.target.closest('button'); if (!b) return;
    const a = b.dataset.a;
    if (a === 'pause') G.setPause(!G.paused);
    if (a === 'speed') G.setSpeed(Number(b.dataset.v));
    if (a === 'menu') G.openMenu();
    if (a === 'dip') G.toggleDip();
  });

  // ---------------------------------------------------------------- bottom: squad cards (v1 look)
  function squadCard(sq) {
    let hp = 0, mx = 0; for (const so of sq.soldiers) { if (so.alive) hp += so.hp; mx += so.maxHp; }
    const grp = Object.entries(G.groups).find(([, v]) => v.includes(sq.id));
    const cls = 'sqcard mini' + (G.sel.has(sq.id) ? ' sel' : '') + (sq.state === 'routing' ? ' routing' : '');
    const tag = sq.state === 'routing' ? 'R' : sq.state === 'wavering' ? '!' : sq.building ? '⚒' : sq.entrenched || sq.garrison ? '⛨' : '';
    return `<div class="${cls}" data-id="${sq.id}" title="${sq.name} · ${sq.stance} · ${sq.formation}">
      ${grp ? `<span class="grp">${grp[0]}</span>` : ''}
      <div class="mi">${ICON[UNIT_ICON[sq.type] || 'spear'] || ''}<b>${Math.max(0, sq.alive)}</b>${tag ? `<span class="st">${tag}</span>` : ''}</div>
      <div class="bar"><i style="width:${mx ? (hp / mx) * 100 : 0}%"></i></div>
      <div class="bar m"><i style="width:${Math.max(0, Math.min(100, sq.moraleEff))}%"></i></div>
    </div>`;
  }
  function renderBottom() {
    const w = G.world;
    const ord = { commander: 0, builder: 1, spear: 2, sword: 3, knight: 4, outrider: 5, archer: 6, xbow: 7, healer: 8, ram: 9, mangonel: 10 };
    const mine = [...w.squads.values()].filter((s) => s.team === 0 && s.deployed && s.alive > 0 && s.state !== 'gone').sort((p, q) => (ord[p.type] ?? 9) - (ord[q.type] ?? 9));
    const sig = mine.map((s) => [s.id, s.alive, Math.round(s.moraleEff / 5), s.state, s.entrenched, !!s.building, G.sel.has(s.id), s.garrison ? 1 : 0, Math.round(s.soldiers.reduce((a, so) => a + (so.alive ? so.hp : 0), 0) / 40)].join(',')).join('|') + JSON.stringify(G.groups);
    if (sig === sigBottom) return;
    sigBottom = sig;
    bottom.className = 'war';
    bottom.innerHTML = `<div class="cards squads parch">${mine.map(squadCard).join('')}</div>`;
  }
  bottom.addEventListener('click', (e) => {
    if (!G.isWar() || (G.mode !== 'battle' && G.mode !== 'over')) return;
    const c = e.target.closest('.sqcard'); if (!c) return;
    G.select([c.dataset.id], e.shiftKey);
  });
  bottom.addEventListener('dblclick', (e) => {
    if (!G.isWar()) return;
    const c = e.target.closest('.sqcard'); if (!c) return;
    const sq = G.world.squads.get(c.dataset.id); if (sq) G.cam.flyTo(sq.cx, sq.cz);
  });

  // ---------------------------------------------------------------- right: command bar / settlement panel
  function cmdBar(sel) {
    const one = sel[0];
    const has = (k, v) => sel.length && sel.every((s) => s[k] === v);
    const ab = one ? ABILITIES[one.def.ability] : null;
    return `<div class="cmdbar parch">
      <div class="lbl">Formation</div>
      <button data-c="formation" data-v="line" class="${has('formation', 'line') ? 'on' : ''}" title="Line (Z)">${ICON.line}<small>Z</small></button>
      <button data-c="formation" data-v="wedge" class="${has('formation', 'wedge') ? 'on' : ''}" title="Wedge (X)">${ICON.wedge}<small>X</small></button>
      <button data-c="formation" data-v="loose" class="${has('formation', 'loose') ? 'on' : ''}" title="Loose (C)">${ICON.loose}<small>C</small></button>
      <button data-c="halt" title="Halt (Backspace)">${ICON.halt}<small>Halt</small></button>
      <div class="lbl">Stance</div>
      <button data-c="stance" data-v="hold" class="${has('stance', 'hold') ? 'on' : ''}" title="Hold (H)">${ICON.hold}<small>H</small></button>
      <button data-c="stance" data-v="aggressive" class="${has('stance', 'aggressive') ? 'on' : ''}" title="Aggressive (G)">${ICON.aggressive}<small>G</small></button>
      <button data-c="stance" data-v="skirmish" class="${has('stance', 'skirmish') ? 'on' : ''}" title="Skirmish (K)">${ICON.skirmish}<small>K</small></button>
      <button data-c="retreat" title="Retreat (R)">${ICON.retreat}<small>R</small></button>
      <div class="lbl">${sel.length === 1 ? one.name : sel.length + ' squads'}</div>
      <button data-c="ability" style="grid-column: span 4; flex-direction: row; gap: 6px" title="${ab ? ab.desc : ''}" ${one && one.abilityCd > 0 ? 'disabled' : ''}>${ICON.ability} ${ab ? ab.name : 'Ability'} <small>F${one && one.abilityCd > 0 ? ' ' + Math.ceil(one.abilityCd) + 's' : ''}</small></button>
    </div>`;
  }
  function settlementPanel(s) {
    const w = G.world, W = w.war;
    const own = s.owner === 0;
    const F = s.owner >= 0 ? W.factions[s.owner] : null;
    const who = F ? F.short : 'Nobody';
    const state = s.kind === 'village' ? (s.state === 'ravaged' ? 'Ravaged, rebuilding' : s.state === 'taxed' ? `Taxed by ${who}` : 'Free village, militia') : `${who}${s.state === 'abandoned' ? ' (abandoned)' : ''}`;
    const prog = s.capTeam >= 0 && s.capT > 0 ? `<div class="cap">Being taken by ${W.factions[s.capTeam] ? W.factions[s.capTeam].short : '?'}: ${Math.round(s.capT)}/${s.need} s</div>` : s.contested ? '<div class="cap">Contested</div>' : '';
    let body = '';
    if (own && s.kind !== 'village' && s.state !== 'razed') {
      const q = (W.queues[0] || []).filter((e) => e.at === s.id);
      const types = WAR_RECRUITABLE.filter((t) => canRecruitAt(s, t));
      body = `<div class="rec">${types.map((t) => {
        const c = w.defs[0][t].cost, ok = w.teams[0].gold >= c;
        return `<button class="rc" data-r="${t}" title="${UNIT_TYPES[t].blurb || ''}"><span class="gl">${ICON[UNIT_ICON[t] || 'spear'] || ''}</span><span class="n">${UNIT_TYPES[t].short}</span><span class="c" style="color:${ok ? '#7a5a10' : '#a3321f'}">${g0(c)}</span></button>`;
      }).join('')}</div>
      <div class="queue">${q.length ? q.map((e, i) => `<span class="qi">${UNIT_TYPES[e.type].short}${i === 0 ? ` <i style="width:${Math.round((1 - e.t / e.total) * 100)}%"></i>` : ''}</span>`).join('') : '<span class="dim">Queue empty · right-click the ground to set a rally point</span>'}</div>`;
    } else if (s.kind === 'village') {
      body = `<div class="info">Hold its square (${s.capR} m) for ${s.need} s with no militia left to take it: <b>pillage</b> for ${g0(s.loot)} g or <b>tax</b> it for ${s.tax} g/min.</div>`;
    } else {
      body = s.state === 'razed' ? `<div class="info">Burnt out. Nobody holds it now; builders can found a new keep on the land.</div>` : `<div class="info">${s.kind === 'outpost' ? `A timber keep on a mound. Hold its yard for ${s.need} s to sack it, or knock the keep down.` : s.kind === 'stronghold' ? `Hold the treasury tent for ${s.need} s to raid it: about ${g0(s.loot)} g, and the fort is yours.` : `Hold the keep's courtyard for ${s.need} s to take it${s.kind === 'capital' ? ' and break the kingdom' : ''}: the vault holds about ${g0(s.loot)} g.`}${s.kind !== 'stronghold' ? ' Bring rams and mangonels for the stone walls.' : ''}</div>`;
    }
    return `<div class="panel parch settle"><h3 class="cinzel">${s.name} <small>${KIND[s.kind]}</small></h3>
      <div class="own"><i style="background:${s.owner >= 0 ? teamHex(s.owner).main : '#888'}"></i>${state}</div>${prog}${body}
      <div style="display:flex;gap:6px;margin-top:6px"><button data-a="look">Look</button><button data-a="close">Close</button></div></div>`;
  }
  function renderRight() {
    const w = G.world;
    const sel = G.selIds().map((id) => w.squads.get(id)).filter(Boolean);
    const s = G.focusSettle ? w.war.settlements.find((q) => q.id === G.focusSettle) : null;
    const q = s ? (w.war.queues[0] || []).filter((e) => e.at === s.id) : [];
    const sig = [G.mode, s ? s.id + s.owner + s.state + Math.round(s.capT) + q.map((e) => e.type + Math.round(e.t)).join() + Math.floor(w.teams[0].gold / 50) : '', sel.map((x) => x.id + x.formation + x.stance + Math.ceil(x.abilityCd)).join(',')].join('|');
    if (sig === sigRight) return;
    sigRight = sig;
    if (s && !sel.length) right.innerHTML = settlementPanel(s);
    else if (sel.length) right.innerHTML = cmdBar(sel);
    else right.innerHTML = `<div class="panel parch" style="max-width:270px;font-size:14px"><b class="cinzel">Command</b><br>Click a soldier or drag a box to select. Right-click to move or attack. Click <b>your keep</b> to raise troops; click a village, fort or castle to see what taking it is worth.</div>`;
    right.querySelectorAll('svg').forEach((v) => { v.style.width = '20px'; v.style.height = '20px'; });
  }
  right.addEventListener('click', (e) => {
    if (!G.isWar() || G.mode === 'prepare') return;
    const b = e.target.closest('button'); if (!b) return;
    if (b.dataset.r) { G.recruit(G.focusSettle, b.dataset.r); sigRight = ''; return; }
    if (b.dataset.a === 'close') { G.focusSettle = null; return; }
    if (b.dataset.a === 'look') { const s = G.world.war.settlements.find((q) => q.id === G.focusSettle); if (s) G.cam.flyTo(s.pos[0], s.pos[1], 160); return; }
    const c = b.dataset.c; if (c) G.order({ type: c, value: b.dataset.v });
  });

  // ---------------------------------------------------------------- left: builders' palette
  function renderLeft() {
    const w = G.world;
    if (G.mode !== 'battle' || !G.buildersSelected()) { if (sigLeft !== 'none') { sigLeft = 'none'; left.className = 'empty'; left.innerHTML = ''; } return; }
    const sig = [G.tool, Math.floor(w.teams[0].gold / 50), w.blueprints.size].join('|');
    if (sig === sigLeft) return;
    sigLeft = sig;
    left.className = 'parch';
    const k = w.priceMult || 1;
    const tools = BUILD_ORDER.map((t) => {
      const B = BUILD_TYPES[t];
      const cost = B.costPerM ? g0(B.costPerM * k) + ' g/m' : B.costPerSeg ? g0(B.costPerSeg * k) + ' g/4m' : g0(B.cost * k) + ' g';
      return `<button class="tool${G.tool === t ? ' on' : ''}" data-t="${t}" title="${B.desc}">${ICON[t] || ICON.tower}<span>${B.name} <span class="k">${B.key}</span></span><span class="cost">${cost}</span></button>`;
    }).join('');
    const mine = [...w.blueprints.values()].filter((b) => b.team === 0);
    left.innerHTML = `<h3 class="cinzel">Builders</h3>${tools}
      <div class="help">Draw a build in your land, or within 60 m of your soldiers. Gold is paid now; the builders walk over and raise it. ${mine.length ? `<b>${mine.length}</b> blueprint${mine.length > 1 ? 's' : ''} waiting. Delete cancels one.` : ''}</div>`;
  }
  left.addEventListener('click', (e) => {
    if (!G.isWar() || G.mode !== 'battle') return;
    const b = e.target.closest('button'); if (!b) return;
    const t = b.dataset.t;
    if (t) G.setTool(G.tool === t ? null : t);
  });

  // ---------------------------------------------------------------- the village choice
  function renderModal() {
    const w = G.world, W = w.war;
    const c = W.choices && W.choices[0];
    const o = !c && w.dip && w.dip.offers[0];
    const sig = c ? c.id + c.kind : o ? o.id : '';
    if (sig === sigModal) return;
    sigModal = sig;
    if (!c && !o) { modal.innerHTML = ''; modal.className = ''; return; }
    modal.className = 'show';
    if (o) {
      const F = W.factions[o.from];
      modal.innerHTML = `<div class="sheet parch letter"><div class="seal" style="background:${teamHex(o.from).main}"></div><h2>An envoy from ${F.short}</h2>
      <p><i>"${F.leader} is weary of this war. Let there be a truce between us${o.gold ? ', and take ' + g0(o.gold) + ' gold for your trouble' : ''}."</i></p>
      <p class="small">A truce lasts 6 minutes: neither side attacks the other. They may still break it.</p>
      <div class="opts"><button class="wax" data-o="yes"><b>Accept</b><span>${o.gold ? '+' + g0(o.gold) + ' g and ' : ''}6 minutes of peace with ${F.short}.</span></button>
      <button data-o="no"><b>Send them away</b><span>The war goes on. They will remember it.</span></button></div></div>`;
      return;
    }
    const s = W.settlements.find((q) => q.id === c.id);
    if (c.kind === 'fort') {
      modal.innerHTML = `<div class="sheet parch"><h2>${s.name}'s treasury is yours</h2>
      <p>You carried off <b>${g0(s.lootPaid || 0)} g</b>. The fort still stands. What now?</p>
      <div class="opts">
        <button class="wax" data-v="burn"><b>Burn it</b><span>+${g0(Math.round((s.lootPaid || 12000) * 0.15))} g more. The walls come down and nobody can use it again.</span></button>
        <button data-v="hold"><b>Hold it</b><span>A forward fort: +250 g/min, +2 banners, it heals your men and raises builders, spears and archers.</span></button>
      </div></div>`;
      return;
    }
    modal.innerHTML = `<div class="sheet parch"><h2>${s.name} is yours</h2>
      <p>The militia are gone and your banner flies over the square. What becomes of the village?</p>
      <div class="opts">
        <button class="wax" data-v="pillage"><b>Pillage</b><span>+${g0(s.loot)} g now. It burns, and pays nothing for 8 minutes.</span></button>
        <button data-v="tax"><b>Protect and tax</b><span>+${s.tax} g every minute while you hold the region.</span></button>
      </div></div>`;
  }
  modal.addEventListener('click', (e) => {
    const b = e.target.closest('button'); if (!b) return;
    const W = G.world.war; const c = W.choices && W.choices[0];
    if (b.dataset.o && G.world.dip && G.world.dip.offers[0]) G.answerEnvoy(G.world.dip.offers[0].id, b.dataset.o === 'yes');
    else if (!c) return;
    else if (c.kind === 'fort') G.chooseFort(c.id, b.dataset.v);
    else G.chooseVillage(c.id, b.dataset.v);
    // close it now, and force the next render to look again (resetting to '' matched
    // "no choice left" and the panel never went away - Liam, 2026-10-10)
    modal.innerHTML = ''; modal.className = '';
    sigModal = null;
  });

  // ---------------------------------------------------------------- minimap
  const mm = $('minimap'), mx = mm.getContext('2d');
  const N = 240;
  let base = null, terr = null, terrV = -1, baseFor = null, fogC = null, fogImg = null, fogT = -1;
  function paintBase() {
    const w = G.world, T = w.terrain, S = T.size;
    mm.width = mm.height = N;
    base = document.createElement('canvas'); base.width = base.height = N;
    const g = base.getContext('2d');
    const img = g.createImageData(N, N);
    for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
      const x = (i + 0.5) * (S / N), z = S - (j + 0.5) * (S / N);
      let c = G.v.terrain.colourAt ? G.v.terrain.colourAt(x, z) : [0.4, 0.5, 0.3];
      const h = T.height(x, z);
      let r = Math.sqrt(c[0]) * 255, gg = Math.sqrt(c[1]) * 255, b = Math.sqrt(c[2]) * 255;
      if (h < T.waterLevel - 0.05) { r = 92; gg = 132; b = 156; }
      const sh = Math.max(0.72, Math.min(1.25, 1 + (T.height(x - 8, z + 8) - h) * 0.03));
      const k = (j * N + i) * 4;
      img.data[k] = r * sh; img.data[k + 1] = gg * sh; img.data[k + 2] = b * sh; img.data[k + 3] = 255;
    }
    g.putImageData(img, 0, 0);
    g.fillStyle = 'rgba(239,226,194,0.16)'; g.fillRect(0, 0, N, N);
    // roads
    g.strokeStyle = 'rgba(120,96,60,0.55)'; g.lineWidth = 1;
    for (const r of w.war.roads) { g.beginPath(); r.forEach((p, k) => { const X = p[0] / S * N, Y = N - p[1] / S * N; k ? g.lineTo(X, Y) : g.moveTo(X, Y); }); g.stroke(); }
    baseFor = w;
  }
  function paintTerritory() {
    const w = G.world, W = w.war, S = w.terrain.size;
    terr = document.createElement('canvas'); terr.width = terr.height = N;
    const g = terr.getContext('2d');
    const img = g.createImageData(N, N);
    for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
      const x = (i + 0.5) * (S / N), z = S - (j + 0.5) * (S / N);
      const gi = Math.floor(x / W.RG), gj = Math.floor(z / W.RG);
      const r = W.regGrid[gj * W.GW + gi];
      if (r === 65535) continue;
      const own = W.regions[r].owner;
      if (own < 0) continue;
      const h = teamHex(own).main;
      const c = [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
      // borders: a different region owner next door
      const r2 = W.regGrid[gj * W.GW + Math.min(W.GW - 1, gi + 2)], r3 = W.regGrid[Math.min(W.GW - 1, gj + 2) * W.GW + gi];
      const edge = (r2 !== 65535 && W.regions[r2].owner !== own) || (r3 !== 65535 && W.regions[r3].owner !== own);
      const k = (j * N + i) * 4;
      img.data[k] = c[0]; img.data[k + 1] = c[1]; img.data[k + 2] = c[2]; img.data[k + 3] = edge ? 230 : 70;
    }
    g.putImageData(img, 0, 0);
  }
  function drawMini() {
    const w = G.world, W = w.war, S = w.terrain.size, k = N / S;
    if (baseFor !== w) { paintBase(); terrV = -1; }
    if (terrV !== W.territoryV) { terrV = W.territoryV; paintTerritory(); }
    mx.drawImage(base, 0, 0);
    mx.drawImage(terr, 0, 0);
    // fog of war: what you cannot see is dimmed
    if (w.vision && !G.reveal) {
      const V = w.vision;
      if (!fogC || fogC.width !== V.W) { fogC = document.createElement('canvas'); fogC.width = fogC.height = V.W; fogImg = fogC.getContext('2d').createImageData(V.W, V.W); }
      if (fogT !== V.t) {
        fogT = V.t;
        const g = V.grid[0];
        for (let j = 0; j < V.W; j++) for (let i = 0; i < V.W; i++) { const o = ((V.W - 1 - j) * V.W + i) * 4; fogImg.data[o] = 20; fogImg.data[o + 1] = 14; fogImg.data[o + 2] = 8; fogImg.data[o + 3] = g[j * V.W + i] ? 0 : 95; }
        fogC.getContext('2d').putImageData(fogImg, 0, 0);
      }
      mx.imageSmoothingEnabled = true;
      mx.drawImage(fogC, 0, 0, V.W * V.CS / S * N, V.W * V.CS / S * N);
    }
    const P = (x, z) => [x * k, N - z * k];
    // settlements
    for (const s of W.settlements) {
      const [a, b] = P(s.pos[0], s.pos[1]);
      const col = s.owner >= 0 && s.owner < 7 ? teamHex(s.owner).main : s.owner === 7 ? '#efe6d0' : '#777';
      mx.fillStyle = col; mx.strokeStyle = '#1a120a'; mx.lineWidth = 1.2;
      if (s.kind === 'village') { mx.beginPath(); mx.arc(a, b, s.state === 'ravaged' ? 2.5 : 3, 0, 6.28); mx.fill(); mx.stroke(); if (s.state === 'ravaged') { mx.fillStyle = 'rgba(40,30,25,0.8)'; mx.fillRect(a - 1, b - 6, 2, 4); } }
      else if (s.state === 'razed') { mx.strokeStyle = '#3a2a20'; mx.beginPath(); mx.moveTo(a - 3, b - 3); mx.lineTo(a + 3, b + 3); mx.moveTo(a + 3, b - 3); mx.lineTo(a - 3, b + 3); mx.stroke(); }
      else if (s.kind === 'stronghold' || s.kind === 'outpost') { mx.beginPath(); mx.moveTo(a, b - 4.5); mx.lineTo(a + 4, b + 3); mx.lineTo(a - 4, b + 3); mx.closePath(); mx.fill(); mx.stroke(); if (s.kind === 'outpost') { mx.fillStyle = '#efe2c2'; mx.fillRect(a - 1, b - 1, 2, 2); } }
      else { const r = s.kind === 'capital' ? 5 : 4; mx.fillRect(a - r, b - r, 2 * r, 2 * r); mx.strokeRect(a - r, b - r, 2 * r, 2 * r); if (s.kind === 'capital') { mx.fillStyle = '#e2b33c'; mx.fillRect(a - 1.5, b - 1.5, 3, 3); } }
      if (W.main && s.owner === W.main && s.kind !== 'village') { mx.strokeStyle = '#ffe9a8'; mx.lineWidth = 1.6; mx.beginPath(); mx.arc(a, b, s.kind === 'capital' ? 9 : 7.5, 0, 6.28); mx.stroke(); if (s.kind === 'capital') { mx.fillStyle = '#ffe9a8'; mx.font = 'bold 10px serif'; mx.textAlign = 'center'; mx.fillText('♛', a, b - 10); } }
      if (s.capT > 0 && s.capTeam >= 0 && (performance.now() / 300 | 0) % 2) { mx.strokeStyle = '#fff'; mx.beginPath(); mx.arc(a, b, 7, 0, 6.28); mx.stroke(); }
    }
    // squads
    for (const sq of w.squads.values()) {
      if (!sq.deployed || sq.alive <= 0 || sq.state === 'gone') continue;
      if (sq.team !== 0 && !G.reveal && !G.seen(sq.cx, sq.cz)) continue;
      const [a, b] = P(sq.cx, sq.cz);
      mx.fillStyle = sq.team === 0 ? (G.sel.has(sq.id) ? '#fff1c4' : '#5d8ee0') : teamHex(sq.team).main;
      const r = sq.team === 7 ? 1.3 : 1.9;
      mx.fillRect(a - r, b - r, 2 * r, 2 * r);
    }
    // the camera's view on the ground
    const c = G.cam.S;
    const pts = [[0, 0], [innerWidth, 0], [innerWidth, innerHeight], [0, innerHeight]].map(([x, y]) => G.groundAt(x, y));
    mx.strokeStyle = 'rgba(255,250,230,0.95)'; mx.lineWidth = 1.4;
    if (pts.every(Boolean)) { mx.beginPath(); pts.forEach((p, i) => { const [a, b] = P(p[0], p[2]); i ? mx.lineTo(a, b) : mx.moveTo(a, b); }); mx.closePath(); mx.stroke(); }
    else { const [ca, cb] = P(c.x, c.z); const r = Math.max(4, c.dist * 0.6 * k); mx.strokeRect(ca - r, cb - r * 0.7, 2 * r, 1.4 * r); }
  }
  function miniToWorld(e) {
    const r = mm.getBoundingClientRect(), S = G.world.terrain.size;
    const u = (e.clientX - r.left) / r.width, v = (e.clientY - r.top) / r.height;
    return [u * S, S - v * S];
  }
  let miniDrag = false;
  mm.addEventListener('pointerdown', (e) => {
    if (!G.isWar()) return;
    e.stopImmediatePropagation();
    miniDrag = true;
    const p = miniToWorld(e);
    if (e.button === 2 && G.sel.size) G.order({ type: 'move', to: p, attackMove: true });
    else G.cam.flyTo(p[0], p[1]);
  }, true);
  mm.addEventListener('pointermove', (e) => { if (G.isWar() && miniDrag && e.buttons & 1) { const p = miniToWorld(e); G.cam.focus(p[0], p[1]); } });
  window.addEventListener('pointerup', () => { miniDrag = false; });

  // ---------------------------------------------------------------- the Banners panel (diplomacy-lite, DESIGN.md 9.4)
  function renderDip() {
    const w = G.world, W = w.war;
    if (!G.dipOpen || G.mode !== 'battle' || !w.dip) { if (sigDip !== 'off') { sigDip = 'off'; dip.className = 'parch'; dip.innerHTML = ''; } return; }
    const rivals = W.slots.filter((x) => x !== 0);
    const rows = rivals.map((r) => {
      const F = W.factions[r], R = relation(w, 0, r);
      const tt = F.alive && R && R.state === 'war' ? truceTerms(w, 0, r) : null;
      const sr = strength(w, r) / Math.max(1, strength(w, 0));
      return { r, F, R, tt, sr, md: mood(w, r, 0), op: opinion(w, r, 0) };
    });
    const sig = [Math.floor(w.t / 2), Math.floor(w.teams[0].gold / 100), G.dipMsg || '', G.payPick || '', w.dip.warn.length].join('|') + rows.map((x) => x.F.alive + (x.R && x.R.state) + (x.tt ? x.tt.price + x.tt.word : '') + x.md).join();
    if (sig === sigDip) return;
    sigDip = sig;
    dip.className = 'parch show';
    const warn = w.dip.warn.map((x) => `<div class="dwarn">⚠ ${W.factions[x.a].short} banners gather on your border...</div>`).join('');
    dip.innerHTML = `<h3 class="cinzel">The Banners <button data-d="close" class="x">✕</button></h3>${warn}
      ${rows.map(({ r, F, R, tt, sr, md, op }) => {
        const state = !F.alive ? 'Fallen' : R.state === 'truce' ? 'Truce · ' + Math.max(0, Math.ceil((R.until - w.t) / 60)) + ' min' : 'At war';
        const main = r === W.main;
        let acts = '';
        if (F.alive && R.state === 'war') acts = `<button data-d="truce" data-f="${r}" title="${tt.reasons.join(' · ')}">Offer truce <small>${g0(tt.price)} g · ${tt.word}</small></button>
            <button data-d="tribute" data-f="${r}" ${sr * 1.5 > 1 ? 'disabled' : ''} title="Needs 1.5x their strength">Demand tribute</button>
            ${(() => { const st = surrenderTerms(w, 0, r); return `<button data-d="surrender" data-f="${r}" class="${st.likely ? 'hotb' : ''}" title="They yield when their army is under 0.3 of yours and half their castles are lost">Demand surrender <small>${st.likely ? 'They will yield' : 'They refuse'}</small></button>`; })()}`;
        else if (F.alive && R.state === 'truce') acts = `<button data-d="pay" data-f="${r}" title="${PAY_ATTACK.toLocaleString()} g: they march on a rival of your choice for 4 minutes">Pay to attack…</button>
            <button data-d="war" data-f="${r}" class="danger" title="Break the truce: every kingdom will remember it">Break truce</button>`;
        const pick = G.payPick === r ? `<div class="pick">March on: ${rivals.filter((t) => t !== r && W.factions[t].alive && hostile(w, r, t)).map((t) => `<button data-d="payto" data-f="${r}" data-t="${t}">${W.factions[t].short}</button>`).join('') || '<i>nobody they fight</i>'}</div>` : '';
        return `<div class="drow${F.alive ? '' : ' fallen'}${main ? ' main' : ''}"><div class="dh"><i style="background:${teamHex(r).main}"></i><b>${main ? '♛ ' : ''}${F.short}</b><span class="lead">${F.leader}</span></div>
          <div class="dm"><span class="st ${R ? R.state : ''}">${state}</span><span>Strength ${sr.toFixed(1)}×</span><span class="mood ${md.toLowerCase()}" title="What they think of you: ${op}">${md}</span></div>
          <div class="da">${acts}</div>${pick}</div>`;
      }).join('')}
      ${G.dipMsg ? `<div class="dmsg">${G.dipMsg}</div>` : '<div class="dmsg muted">A truce stops the fighting for 6 minutes. Break one and every kingdom remembers.</div>'}`;
  }
  dip.addEventListener('click', (e) => {
    const b = e.target.closest('button'); if (!b || !G.isWar()) return;
    const d = b.dataset.d, f = +b.dataset.f;
    if (d === 'close') { G.toggleDip(false); return; }
    if (d === 'pay') { G.payPick = G.payPick === f ? null : f; sigDip = ''; return; }
    G.diplo(d, f, +b.dataset.t);
    G.payPick = null; sigDip = '';
  });

  // hover over the map: settlement names
  function reset() { sigTop = sigBottom = sigRight = sigLeft = sigModal = sigDip = ''; baseFor = null; modal.innerHTML = ''; modal.className = ''; dip.innerHTML = ''; dip.className = 'parch'; }
  function update() {
    if (!G.isWar()) return;
    renderTop();
    if (G.mode === 'battle' || G.mode === 'over') { renderBottom(); renderRight(); renderLeft(); renderModal(); }
    renderDip();
    drawMini();
  }
  return { update, reset };
}
