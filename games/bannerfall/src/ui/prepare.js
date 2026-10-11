// BANNERFALL :: ui/prepare.js - the prepare phase: build palette, recruit cards, reserve tray,
// scout report and the Start Battle seal.
import { ICON, UNIT_ICON } from './icons.js';
import { UNIT_TYPES, RECRUITABLE, WAR_RECRUITABLE } from '../data/units.js';
import { bannerCap, bannersUsed } from '../sim/war.js';
import { teamHex } from '../render/unitMeshes.js';
const g0 = (n) => Math.round(n).toLocaleString('en-GB');
import { BUILD_TYPES, BUILD_ORDER, FOUNDING_BUILDS } from '../data/builds.js';

const $ = (id) => document.getElementById(id);

const BARS = {
  spear: [3, 3, 2], sword: [4, 4, 2], archer: [3, 1, 3], xbow: [4, 2, 2], healer: [0, 1, 2], outrider: [3, 2, 5], knight: [5, 5, 4], sapper: [1, 2, 2], builder: [1, 1, 2], ram: [5, 5, 1], mangonel: [5, 2, 1],
};

export function createPrepareUI(G) {
  const left = $('left'), bottom = $('bottom'), right = $('right');
  let sigL = '', sigB = '', sigR = '';

  function renderLeft() {
    const w = G.world;
    const sig = [G.tool, w.teams[0].gold].join('|');
    if (sig === sigL) return;
    sigL = sig;
    left.className = 'parch';
    const tools = (w.war ? FOUNDING_BUILDS : BUILD_ORDER.slice(0, 9)).map((k) => {
      const B = BUILD_TYPES[k];
      const locked = w.builds && !w.builds.includes(k);
      const pm = w.priceMult || 1;
      const cost = B.costPerM ? g0(B.costPerM * pm) + ' g/m' : B.costPerSeg ? g0(B.costPerSeg * pm) + ' g/4m' : g0(B.cost * pm) + ' g';
      return `<button class="tool${G.tool === k ? ' on' : ''}${locked ? ' locked' : ''}" data-t="${k}" title="${B.desc}${locked ? ' (locked)' : ''}">${locked ? ICON.lock : ICON[k] || ICON.tower}<span>${B.name} <span class="k">${B.key}</span></span><span class="cost">${cost}</span></button>`;
    }).join('');
    const B = G.tool ? BUILD_TYPES[G.tool] : null;
    left.innerHTML = `<h3 class="cinzel">Earthworks &amp; Walls</h3>${tools}
      <div class="help">${B ? (w.war ? B.desc.replace(/d+ g( per w+| per d+ m(?: row)?)?.? ?/, '') : B.desc) + '<br><i>Right-click or Esc to put the tool down. Ctrl+Z undoes, Delete removes.</i>' : w.war ? 'Pick a tool, then drag inside your land (it glows blue). The royal masons raise it at once, and it refunds in full until you raise the banners.' : 'Pick a tool, then drag on the blue ground. Everything refunds in full until the battle starts.'}</div>
      <button data-a="undo" style="margin-top:4px">Undo (Ctrl+Z)</button>`;
  }
  left.addEventListener('click', (e) => {
    if (G.mode !== 'prepare') return;
    const b = e.target.closest('button'); if (!b) return;
    if (b.dataset.a === 'undo') { G.undo(); return; }
    const t = b.dataset.t;
    if (t) G.setTool(G.tool === t ? null : t);
  });

  function card(type) {
    const U = UNIT_TYPES[type], w = G.world;
    const locked = w.unlocked && !w.unlocked.includes(type);
    const cost = w.defs[0][type] ? w.defs[0][type].cost : U.cost;
    const afford = w.teams[0].gold >= cost;
    const b = BARS[type] || [2, 2, 2];
    const bar = (v) => `<i style="width:${v * 20}%"></i>`;
    return `<div class="card${locked ? ' locked' : ''}" data-u="${type}" title="${U.blurb}">
      <div class="nm">${U.name}</div>
      <div class="row"><span>${U.men} men</span><span style="color:${afford ? '#7a5a10' : '#a3321f'}">${g0(cost)} g</span></div>
      <div class="glyph">${locked ? ICON.lock : ICON[UNIT_ICON[type]]}</div>
      <div class="bars"><span>ATK</span>${bar(b[0])}<span>DEF</span>${bar(b[1])}<span>SPD</span>${bar(b[2])}</div>
      <div class="beats">Beats: ${U.beats}</div>
      <div class="fears">Fears: ${U.fears}</div>
      ${locked ? `<div class="fears" style="font-weight:800">Unlocks later</div>` : ''}
    </div>`;
  }
  function chip(sq) {
    return `<div class="chip${sq.deployed ? '' : ' out'}" data-id="${sq.id}" title="${sq.deployed ? 'In the field. Click to select it.' : 'Drag me onto the blue ground'}"><span class="dot">${ICON[UNIT_ICON[sq.type]]}</span>${sq.name}</div>`;
  }
  function renderBottom() {
    const w = G.world;
    const mine = [...w.squads.values()].filter((s) => s.team === 0);
    const owned = mine.filter((s) => s.type !== 'commander').length;
    const sig = [w.teams[0].gold, mine.map((s) => s.id + s.deployed).join(','), G.sel.size].join('|');
    if (sig === sigB) return;
    sigB = sig;
    const reserve = mine.filter((s) => !s.deployed);
    bottom.className = 'prep';
    bottom.innerHTML = `
      <div class="tray parch"><span class="lbl">${w.war ? 'Banners ' + bannersUsed(w, 0) + '/' + bannerCap(w, 0) + ' (take castles to raise more)' : 'Army ' + owned + '/' + w.def.deployCap + ' squads'}${reserve.length ? ' · reserve, drag onto the field:' : ' · click a card to recruit, it marches straight onto the field'}</span>${reserve.map(chip).join('')}</div>
      <div class="cards parch">${(w.war ? WAR_RECRUITABLE : RECRUITABLE).map(card).join('')}</div>`;
  }
  bottom.addEventListener('click', (e) => {
    if (G.mode !== 'prepare') return;
    const c = e.target.closest('.card');
    if (c && !c.classList.contains('locked')) G.buy(c.dataset.u);
  });
  // drag a reserve chip onto the field
  bottom.addEventListener('pointerdown', (e) => {
    if (G.mode !== 'prepare') return;
    const ch = e.target.closest('.chip'); if (!ch) return;
    const sq = G.world.squads.get(ch.dataset.id); if (!sq) return;
    e.preventDefault();
    G.beginDeployDrag(sq.id, e);
  });

  function renderWarRight() {
    const w = G.world, W = w.war, T = w.teams[0];
    const start = W.startGold || 1;
    let army = 0; for (const s of w.squads.values()) if (s.team === 0 && s.bought) army += s.def.cost;
    const kingdom = Math.max(0, T.spent - army);
    const sig = [Math.round(T.gold), army, kingdom].join('|');
    if (sig === sigR) return;
    sigR = sig;
    const pct = (v) => Math.max(0, Math.min(100, (v / start) * 100)).toFixed(1);
    const rivals = W.slots.filter((s) => s !== 0).map((s) => W.factions[s]);
    const n = (k) => W.settlements.filter((s) => s.kind === k).length;
    right.innerHTML = `
      <div class="panel parch scout"><h3 class="cinzel">The Royal Grant</h3>
        <div class="split"><i class="k" style="width:${pct(kingdom)}%"></i><i class="a" style="width:${pct(army)}%"></i><i class="r" style="width:${pct(T.gold)}%"></i></div>
        <div class="splitk"><span><b class="k"></b>Kingdom ${g0(kingdom)}</span><span><b class="a"></b>Army ${g0(army)}</span><span><b class="r"></b>Reserve ${g0(T.gold)}</span></div>
        <div style="margin-top:6px">${W.gen.size / 1000} km of ${W.gen.biome === 'river' ? 'river country' : W.gen.biome} · ${n('village')} villages · ${n('stronghold')} forts · ${n('castle') + n('capital') - 1} castles</div>
        <ul style="margin:6px 0 4px">${rivals.map((f) => `<li><i class="dotc" style="background:${teamHex(f.slot).main}"></i><b>${f.name}</b>, ${f.leader}</li>`).join('')}</ul>
        <div style="font-size:13px;color:#5a4632">Win: take every rival capital. Lose: hold no castle for a minute.</div>
      </div>
      <button class="wax" data-a="start" title="Enter">Raise the Banners</button>`;
  }
  function renderRight() {
    const w = G.world;
    if (w.war) return renderWarRight();
    const deployed = [...w.squads.values()].some((s) => s.team === 0 && s.deployed && s.type !== 'commander');
    const sig = [deployed].join('|');
    if (sig === sigR) return;
    sigR = sig;
    const counts = {};
    for (const wv of w.def.enemy.waves) for (const u of wv.units) counts[u] = (counts[u] || 0) + 1;
    const nm = { spear: 'spear companies', sword: 'sword company', archer: 'archer companies', outrider: 'horse seen', xbow: 'crossbows', knight: 'knights' };
    right.innerHTML = `
      <div class="panel parch scout"><h3 class="cinzel">Scout Report</h3>
        <div>${w.def.blurb}</div>
        <ul style="margin:6px 0 4px">${Object.entries(counts).map(([k, v]) => `<li>${k === 'outrider' ? 'Horse seen (' + v + ')' : 'About ' + v + ' ' + (nm[k] || k)}</li>`).join('')}<li>${w.def.enemy.waves.length} waves over ${Math.round(w.def.timeLimit / 60)} minutes</li></ul>
        <div style="font-size:13px;color:#5a4632">Stars: win · lose under ${w.def.stars.maxLossPct}% of your men · ${w.def.stars.objectiveText}</div>
      </div>
      <button class="wax" data-a="start" ${deployed ? '' : 'disabled'} title="Enter">Start Battle</button>`;
  }
  right.addEventListener('click', (e) => {
    if (G.mode !== 'prepare') return;
    const b = e.target.closest('button'); if (b && b.dataset.a === 'start') G.startBattle();
  });

  function reset() { sigL = sigB = sigR = ''; }
  function update() {
    if (G.mode !== 'prepare') return;
    renderLeft(); renderBottom(); renderRight();
  }
  return { update, reset };
}
