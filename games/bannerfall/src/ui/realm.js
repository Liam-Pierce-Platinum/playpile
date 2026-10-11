// BANNERFALL :: ui/realm.js - the Long War's King-tier HUD (DESIGN.md 21.2, 20.7, 19.6).
//   top        the date and season, the treasury and what a season brings, the day clock (pause,
//              1x, 2x, 4x), the Court (with sealed letters waiting), save and the menu
//   left       the kingdoms of the realm: colour, land, strength, how they stand with you
//   right      the selection: a province (its seat, garrison, loyalty, villages; raise troops at
//              your castles) or an army (its general, men, squads, orders, stance; siege choices)
//   bottom     the chronicle: the last things that happened in the realm
//   modals     the Engagement card (fight it, let the General fight, auto-resolve, withdraw,
//              parley), envoy letters (accept / decline), battle results, and The Court
import { UNIT_TYPES } from '../data/units.js';
import { ICON, UNIT_ICON } from './icons.js';
import { armyMen, armyCap, armiesOf, canRaiseAt, unitCost, findPath, pathDays, edgeBetween, visibleTo } from '../sim/realm/armies.js';
import { engagementInfo } from '../sim/realm/engage.js';
import { opinion, moodWord, atWar, atTruce, treaty, judge, strength, scoreFor, personality, liegeOf, rel, allies } from '../sim/realm/diplomacy.js';
import { seasonIncome, seasonUpkeep } from '../sim/realm/economy.js';
import { dateText } from '../sim/realm/realm.js';
import { REALM_PERSONALITY } from '../data/personalities.js';

const $ = (id) => document.getElementById(id);
const g0 = (n) => Math.round(n).toLocaleString('en-GB');
const hex = (c) => '#' + c.toString(16).padStart(6, '0');
const SEASON_ICON = { Spring: '❀', Summer: '☀', Autumn: '❦', Winter: '❄' };
const RAISE = ['spear', 'pike', 'sword', 'menAtArms', 'halberd', 'shieldbearer', 'archer', 'longbow', 'xbow', 'javelin', 'healer', 'standard', 'outrider', 'horseArcher', 'knight', 'heavyCav', 'ram', 'siegeTower', 'mangonel', 'ballista', 'builder'];
const SEAT = { capital: 'Capital', castle: 'Castle', stronghold: 'Fort', outpost: 'Outpost', none: 'No seat' };

export function createRealmUI(G) {
  const top = $('top'), left = $('left'), right = $('right'), bottom = $('bottom');
  const modal = document.createElement('div'); modal.id = 'rmodal'; $('hud').appendChild(modal);
  const court = document.createElement('div'); court.id = 'court'; court.className = 'parch'; $('hud').appendChild(court);
  const labels = document.createElement('div'); labels.id = 'rlabels'; $('hud').insertBefore(labels, $('hud').firstChild);
  let sig = {};
  const me = () => G.realm.kingdoms.find((k) => k.player);
  const K = (id) => G.realm.kingdoms[id];
  const stateWord = (R, a, b) => (a === b ? 'You' : atWar(R, a, b) ? 'War' : atTruce(R, a, b) ? 'Truce' : liegeOf(R, b) === a ? 'Vassal' : liegeOf(R, a) === b ? 'Liege' : treaty(R, 'alliance', a, b) ? 'Ally' : treaty(R, 'defAlliance', a, b) ? 'Def. ally' : treaty(R, 'trade', a, b) ? 'Trade' : 'Peace');

  // ---------------------------------------------------------------- top bar
  function renderTop() {
    const R = G.realm, k = me();
    const net = (k.seasonIncome || 0) - (k.seasonUpkeep || 0);
    const letters = R.letters.filter((l) => l.to === k.id).length;
    const s = [R.day, Math.round(k.gold), net, G.rPaused, G.rSpeed, letters, G.courtOpen, R.result ? 1 : 0].join('|');
    if (s === sig.top) return; sig.top = s;
    top.innerHTML = `
      <div class="seg parch date" title="A day passes every 2 seconds at 1x. A season is 30 days."><span class="sicon">${SEASON_ICON[R.season]}</span><b>${R.season}</b><small>day ${R.dayOfSeason + 1} · year ${R.year}</small></div>
      <div class="seg parch gold" title="Treasury. A season brings ${g0(k.seasonIncome || 0)} g and costs ${g0(k.seasonUpkeep || 0)} g in upkeep."><span class="coin"></span><b>${g0(k.gold)}</b> g <small class="inc${net < 0 ? ' neg' : ''}">${net >= 0 ? '+' : '−'}${g0(Math.abs(net))}/season</small></div>
      <div class="seg parch" style="padding:4px 6px;gap:4px">
        <button data-a="pause" class="${G.rPaused ? 'on' : ''}" title="Pause (Space)" style="width:40px">${G.rPaused ? ICON.play : ICON.pause}</button>
        ${[1, 2, 4].map((v) => `<button data-a="speed" data-v="${v}" class="${G.rSpeed === v && !G.rPaused ? 'on' : ''}">${v}×</button>`).join('')}
      </div>
      <div class="seg parch" style="padding:4px 6px;gap:4px"><button data-a="court" class="${G.courtOpen ? 'on' : ''}${letters ? ' hot' : ''}" title="The Court: diplomacy (U)">⚜ Court${letters ? ' <b class="badge">' + letters + '</b>' : ''}</button><button data-a="save" title="Save the war">Save</button><button data-a="menu" title="Menu (Esc)">☰</button></div>`;
    top.querySelectorAll('button svg').forEach((v) => { v.style.width = '18px'; v.style.height = '18px'; });
  }
  top.addEventListener('click', (e) => {
    if (G.mode !== 'realm') return;
    const b = e.target.closest('button'); if (!b) return;
    const a = b.dataset.a;
    if (a === 'pause') G.realmPause(!G.rPaused);
    if (a === 'speed') { G.rSpeed = +b.dataset.v; G.realmPause(false); }
    if (a === 'court') toggleCourt();
    if (a === 'save') G.saveRealm(1);
    if (a === 'menu') G.openMenu();
  });

  // ---------------------------------------------------------------- left: the kingdoms
  function renderLeft() {
    const R = G.realm, k = me();
    const list = R.kingdoms.filter((x) => x.alive || (!x.rebel && x.fellDay > R.day - 240));
    const s = R.day + '|' + list.map((x) => x.id + x.alive + R.provinces.filter((p) => p.owner === x.id).length + stateWord(R, k.id, x.id)).join(',');
    if (s === sig.left) return; sig.left = s;
    left.className = 'parch realmk';
    left.innerHTML = `<h3 class="cinzel">The Realm</h3>${list.map((x) => {
      const n = R.provinces.filter((p) => p.owner === x.id).length;
      const st = stateWord(R, k.id, x.id);
      return `<button class="kg${x.alive ? '' : ' fallen'}${x.id === R.main ? ' main' : ''}" data-k="${x.id}" title="${x.name}${x.alive ? '' : ' (fallen)'}"><i style="background:${hex(x.main)};border-color:${hex(x.trim)}"></i><span class="n">${x.id === R.main ? '♛ ' : ''}${x.short}</span><span class="p">${x.landless ? 'landless' : n + ' prov.'}</span><span class="st ${st.toLowerCase().replace(/[^a-z]/g, '')}">${x.alive ? st : 'Fallen'}</span></button>`;
    }).join('')}<div class="help">Click a kingdom to treat with it. <b>U</b> opens the Court.</div>`;
  }
  left.addEventListener('click', (e) => {
    if (G.mode !== 'realm') return;
    const b = e.target.closest('button'); if (!b) return;
    if (b.dataset.k !== undefined) { const id = +b.dataset.k; if (id === me().id) return; G.courtSel = id; G.courtDeal = null; toggleCourt(true); }
  });

  // ---------------------------------------------------------------- right: the selection
  function provincePanel(P) {
    const R = G.realm, k = me();
    const O = P.owner >= 0 ? K(P.owner) : null;
    const men = P.garrison.reduce((a, s) => a + s.men, 0);
    const mineCastle = canRaiseAt(R, k.id, P);
    const q = k.queue.filter((e) => e.prov === P.id);
    const siege = P.siegedBy && P.siegedBy !== -1 ? R.armies.find((x) => x.id === P.siegedBy) : null;
    let body = `<div class="own"><i style="background:${O ? hex(O.main) : '#888'}"></i>${O ? O.short : 'Free land'}${O && O.id !== k.id ? ` · <span class="st">${stateWord(R, k.id, O.id)}</span>` : ''}</div>
      <div class="facts"><span>${SEAT[P.seat]}</span><span>${P.biome}</span><span>Wealth ${'●'.repeat(P.dev)}${'○'.repeat(Math.max(0, 5 - P.dev))}</span></div>
      <div class="facts"><span>Garrison <b>${men}</b> men</span>${P.seat !== 'none' ? `<span>Supplies <b>${P.supplies}</b> days</span>` : ''}</div>
      <div class="lbar" title="Loyalty ${P.loyalty}"><i style="width:${P.loyalty}%;background:${P.loyalty < 30 ? '#a3321f' : P.loyalty < 55 ? '#c9a43b' : '#3f7a2e'}"></i><span>Loyalty ${P.loyalty}${P.loyalty < 30 ? ' · unrest!' : ''}</span></div>
      <div class="vill">${P.villages.map((v) => `<span class="${v.state}" title="${['', 'Hamlet', 'Village', 'Town'][v.tier]}: ${v.state}">${['', '⌂', '⌂⌂', '⌂⌂⌂'][v.tier]}</span>`).join('')}</div>
      ${siege ? `<div class="cap">Besieged by ${K(siege.kingdom).short} · day ${P.siegeDays}</div>` : ''}`;
    if (mineCastle) {
      body += `<div class="rec">${RAISE.map((t) => { const c = unitCost(t); return `<button class="rc" data-r="${t}" title="${UNIT_TYPES[t].blurb || ''}"><span class="gl">${ICON[UNIT_ICON[t] || 'spear'] || ''}</span><span class="n">${UNIT_TYPES[t].short}</span><span class="c" style="color:${k.gold >= c ? '#7a5a10' : '#a3321f'}">${g0(c)}</span></button>`; }).join('')}</div>
        <div class="queue">${q.length ? q.map((e) => `<span class="qi">${UNIT_TYPES[e.type].short} · ${Math.max(0, Math.ceil(e.days))}d</span>`).join('') : '<span class="muted">A squad every 2 days. New squads join an army here, or form one.</span>'}</div>
        ${P.garrison.length > 1 ? `<button data-a="muster" style="margin-top:5px">Muster the garrison into an army</button>` : ''}`;
    } else if (P.owner === k.id) body += `<div class="info">Only castles and your capital raise troops. ${P.seat === 'none' ? 'Take or build a castle to rule it well.' : ''}</div>`;
    else if (O && atWar(R, k.id, O.id)) body += `<div class="info">At war: select an army and right-click here to <b>attack</b> (besiege its seat) or raid it.</div>`;
    return `<div class="panel parch settle rsel"><h3 class="cinzel">${P.name} <small>${SEAT[P.seat]}</small></h3>${body}
      <div style="display:flex;gap:6px;margin-top:6px"><button data-a="look">Look</button><button data-a="close">Close</button></div></div>`;
  }
  function armyPanel(A) {
    const R = G.realm, k = me();
    const mine = A.kingdom === k.id;
    const by = {};
    for (const s of A.squads) by[s.type] = (by[s.type] || 0) + s.men;
    const where = A.edge ? `marching to ${R.provinces[A.edge.to].name} (${Math.max(0, Math.ceil(A.edge.days - A.edge.t))} d)` : `at ${R.provinces[A.prov].name}`;
    const P = R.provinces[A.prov];
    const sieging = !A.edge && A.siegeOf >= 0 && R.provinces[A.siegeOf] && R.provinces[A.siegeOf].siegedBy === A.id;
    const ord = A.order ? { march: 'Marching', attack: 'Attacking', besiege: 'Besieging', raid: 'Raiding', defend: 'Holding', winter: 'To winter quarters' }[A.order.type] || A.order.type : 'Holding';
    let acts = '';
    if (mine) {
      acts += `<div class="lbl">Stance</div><div class="row">${['avoid', 'accept', 'seek'].map((s) => `<button data-st="${s}" class="${A.stance === s ? 'on' : ''}">${{ avoid: 'Avoid battle', accept: 'Accept battle', seek: 'Seek battle' }[s]}</button>`).join('')}</div>`;
      if (sieging) acts += `<div class="lbl">The siege of ${R.provinces[A.siegeOf].name} · day ${R.provinces[A.siegeOf].siegeDays} · their supplies ${R.provinces[A.siegeOf].supplies} d</div><div class="row"><button data-sg="assault" class="wax">Assault</button><button data-sg="starve">Starve them</button><button data-sg="terms">Offer terms</button><button data-sg="lift">Lift</button></div>`;
      else if (!A.edge && P.owner !== k.id && (P.owner < 0 || atWar(R, k.id, P.owner))) acts += `<div class="row"><button data-o="attack">Attack ${P.name}</button><button data-o="raid">Raid its villages</button></div>`;
      const others = R.armies.filter((x) => x !== A && x.kingdom === k.id && x.prov === A.prov && !x.edge && !A.edge);
      acts += `<div class="row">${!A.edge && P.owner === k.id ? '<button data-o="garrison">Garrison here</button>' : ''}${A.squads.length > 3 && !A.edge ? '<button data-o="split">Split</button>' : ''}${others.length ? `<button data-o="merge" data-w="${others[0].id}">Merge with ${others[0].name}</button>` : ''}</div>
        <div class="help">Right-click a province to march there: enemy land means <b>attack</b>, free land <b>take it</b>.</div>`;
    }
    return `<div class="panel parch settle rsel"><h3 class="cinzel">${A.name}</h3>
      <div class="own"><i style="background:${hex(K(A.kingdom).main)}"></i>${K(A.kingdom).short} · ${A.general.name} <small>(level ${A.general.level})</small></div>
      <div class="facts"><span><b>${armyMen(A)}</b> men in ${A.squads.length} squads</span><span>${ord}, ${where}</span></div>
      <div class="sqs">${Object.entries(by).map(([t, n]) => `<span title="${UNIT_TYPES[t].name}">${ICON[UNIT_ICON[t] || 'spear'] || ''}<b>${n}</b></span>`).join('')}</div>
      ${acts}
      <div style="display:flex;gap:6px;margin-top:6px"><button data-a="look">Look</button><button data-a="close">Close</button></div></div>`;
  }
  function renderRight() {
    const R = G.realm;
    const A = G.rSel && G.rSel.army ? R.armies.find((x) => x.id === G.rSel.army) : null;
    const P = G.rSel && G.rSel.prov !== undefined && !A ? R.provinces[G.rSel.prov] : null;
    const k = me();
    const s = [R.day, Math.floor(k.gold / 200), JSON.stringify(G.rSel), A ? A.squads.length + A.stance + (A.order && A.order.type) + armyMen(A) + (A.edge ? A.edge.t.toFixed(0) : '') : '', P ? P.owner + P.garrison.length + P.supplies + k.queue.length : ''].join('|');
    if (s === sig.right) return; sig.right = s;
    if (A) right.innerHTML = armyPanel(A);
    else if (P) right.innerHTML = provincePanel(P);
    else {
      const my = armiesOf(R, k.id);
      right.innerHTML = `<div class="panel parch" style="max-width:300px;font-size:14px"><b class="cinzel">Your hosts</b> <small>(${my.length} of ${armyCap(R, k.id)})</small>
        ${my.map((x) => `<button class="hostb" data-army="${x.id}"><i style="background:${hex(k.main)}"></i>${x.name} · <b>${armyMen(x)}</b> · ${x.edge ? '→ ' + R.provinces[x.edge.to].name : R.provinces[x.prov].name}</button>`).join('') || '<div class="muted">No army in the field. Raise one at a castle.</div>'}
        <div class="help" style="margin-top:6px">Click a province or an army. Right-click a province to march the selected army.</div></div>`;
    }
    right.querySelectorAll('svg').forEach((v) => { v.style.width = '18px'; v.style.height = '18px'; });
  }
  right.addEventListener('click', (e) => {
    if (G.mode !== 'realm') return;
    const b = e.target.closest('button'); if (!b) return;
    const R = G.realm;
    const A = G.rSel && G.rSel.army ? R.armies.find((x) => x.id === G.rSel.army) : null;
    if (b.dataset.army) { G.rSel = { army: b.dataset.army }; const X = R.armies.find((x) => x.id === b.dataset.army); if (X) G.realmLook(X); return; }
    if (b.dataset.a === 'close') { G.rSel = null; G.rv.showPath(null); return; }
    if (b.dataset.a === 'look') { if (A) G.realmLook(A); else if (G.rSel) { const P = R.provinces[G.rSel.prov]; G.cam.flyTo(P.pos[0], P.pos[1], 1200); } return; }
    if (b.dataset.a === 'muster') { G.realmCmd('muster', G.rSel.prov); return; }
    if (b.dataset.r) { G.realmCmd('raise', G.rSel.prov, b.dataset.r); sig.right = ''; return; }
    if (A && b.dataset.st) { G.realmCmd('stance', A.id, b.dataset.st); return; }
    if (A && b.dataset.sg) { G.realmCmd('siege', A.id, b.dataset.sg); return; }
    if (A && b.dataset.o) { G.realmCmd('order', A.id, b.dataset.o, b.dataset.w); return; }
  });

  // ---------------------------------------------------------------- bottom: the chronicle
  function renderBottom() {
    const R = G.realm;
    const s = R.log.length + '|' + (R.log.length ? R.log[R.log.length - 1].day : 0);
    if (s === sig.bottom) return; sig.bottom = s;
    bottom.className = 'realm';
    const lines = R.log.slice(-5).reverse();
    bottom.innerHTML = `<div class="chron parch">${lines.map((l) => `<div class="cl ${l.kind}"><small>${l.day}</small> ${l.text}</div>`).join('') || '<div class="cl muted">The realm is quiet.</div>'}</div>`;
  }

  // ---------------------------------------------------------------- floating labels (province names, army badges)
  const lab = new Map();
  function renderLabels() {
    const R = G.realm, cam = G.cam.S;
    const showProv = cam.dist < 4800;
    const used = new Set();
    const put = (key, x, y, z, html, cls) => {
      const p = G.toScreen(x, y, z);
      if (p[2] > 1 || p[0] < -80 || p[1] < -40 || p[0] > innerWidth + 80 || p[1] > innerHeight + 40) return;
      let el = lab.get(key);
      if (!el) { el = document.createElement('div'); el.className = 'rl ' + cls; labels.appendChild(el); lab.set(key, el); el._h = ''; }
      if (el._h !== html) { el.innerHTML = html; el._h = html; }
      el.style.transform = `translate(${Math.round(p[0])}px, ${Math.round(p[1])}px)`;
      used.add(key);
    };
    if (showProv) for (const P of R.provinces) {
      const y = G.rv.heightAt(P.pos[0], P.pos[1]);
      const sieged = P.siegedBy && P.siegedBy !== -1;
      put('p' + P.id, P.pos[0], y + (P.seat === 'none' ? 30 : P.seat === 'capital' ? 150 : 110), P.pos[1] - 70, `${P.seat === 'capital' ? '♛ ' : ''}${P.name}${sieged ? ' <b class="sg">⚔</b>' : ''}`, 'prov' + (G.rSel && G.rSel.prov === P.id ? ' sel' : '') + (P.owner === me().id ? ' mine' : ''));
    }
    for (const A of R.armies) {
      const p = G.rv.armyPos.get(A.id); if (!p || !visibleTo(R, me().id, A)) continue;
      put('a' + A.id, p.x, (p.y || 0) + (p.sc || 30) * 3.2, p.z, `<i style="background:${hex(K(A.kingdom).main)}"></i>${g0(armyMen(A))}`, 'army' + (G.rSel && G.rSel.army === A.id ? ' sel' : ''));
    }
    for (const E of R.engagements) if (E.status === 'pending' || E.status === 'live') { const P = R.provinces[E.prov]; put('e' + E.id, P.pos[0], G.rv.heightAt(P.pos[0], P.pos[1]) + 60, P.pos[1] + 60, '⚔', 'eng'); }
    for (const [k, el] of lab) if (!used.has(k)) { el.remove(); lab.delete(k); }
  }

  // ---------------------------------------------------------------- modals: engagement, letters, results
  function renderModal() {
    const R = G.realm, k = me();
    const E = R.engagements.find((x) => x.status === 'pending');
    const L = !E && R.letters.find((l) => l.to === k.id && !G.letterSeen?.[l.id]);
    const res = !E && !L && G.rResult;
    const s = E ? 'E' + E.id : L ? 'L' + L.id : res ? 'R' + res.id : '';
    if (s === sig.modal) return; sig.modal = s;
    if (!s) { modal.className = ''; modal.innerHTML = ''; return; }
    modal.className = 'show';
    if (E) {
      const I = engagementInfo(R, E);
      const mineAtt = I.att.some((A) => A.kingdom === k.id);
      const myPow = mineAtt ? I.attPow : I.defPow, thPow = mineAtt ? I.defPow : I.attPow;
      const myMen = mineAtt ? I.attMen : I.defMen, thMen = mineAtt ? I.defMen : I.attMen;
      const foe = mineAtt ? I.defK : I.attK;
      const pct = Math.round(myPow / Math.max(1, myPow + thPow) * 100);
      modal.innerHTML = `<div class="sheet parch eng"><h2>${E.assault ? 'Assault on' : 'Battle at'} ${I.prov.name}</h2>
        <p class="small">${I.prov.biome} · ${I.season}, ${I.weather}${I.prov.seat !== 'none' ? ' · ' + SEAT[I.prov.seat] + ' of ' + (I.prov.owner >= 0 ? K(I.prov.owner).short : 'the free folk') : ''}</p>
        <div class="sides"><div><b style="color:${hex(k.main)}">${k.short}</b><span>${g0(myMen)} men</span></div><div class="vs">vs</div><div><b style="color:${foe ? hex(foe.main) : '#5a4632'}">${foe ? foe.short : 'Free men'}</b><span>${g0(thMen)} men${E.assault ? ' behind walls' : ''}</span></div></div>
        <div class="sbar"><i style="width:${pct}%;background:${hex(k.main)}"></i><i style="width:${100 - pct}%;background:${foe ? hex(foe.main) : '#8a7a5c'}"></i></div>
        <p class="small">Your strength ${pct}% of the field. ${pct > 60 ? 'The odds are with you.' : pct < 40 ? 'The odds are against you.' : 'An even fight.'}</p>
        <div class="opts">
          <button class="wax" data-e="fight"><b>Fight it</b><span>Take the field as General: deploy, dig in, command it live.</span></button>
          <button data-e="general"><b>Let the General fight</b><span>A live battle under your general's command. Watch it, or step in.</span></button>
          <button data-e="auto"><b>Auto-resolve</b><span>The battle is decided at once.</span></button>
          ${mineAtt && !E.assault ? '<button data-e="withdraw"><b>Withdraw</b><span>Fall back one province; the rearguard costs 5% of your men.</span></button>' : ''}
          ${foe && atWar(R, k.id, foe.id) ? '<button data-e="parley"><b>Parley</b><span>Offer a truce instead of a battle.</span></button>' : ''}
        </div><div class="pmsg">${G.parleyMsg || ''}</div></div>`;
      return;
    }
    if (L) {
      const F = K(L.from);
      const yes = L.kind === 'warning' ? 'Noted' : L.kind === 'call' ? 'Answer the call' : L.deal && L.deal.type === 'tribute' ? 'Pay' : 'Accept';
      const no = L.kind === 'warning' ? '' : L.kind === 'call' ? 'Refuse' : L.deal && L.deal.type === 'tribute' ? 'Refuse (war)' : 'Decline';
      modal.innerHTML = `<div class="sheet parch letter"><div class="seal" style="background:${hex(F.main)}"></div><h2>A letter from ${F.short}</h2>
        <p><i>"${L.text}"</i></p><p class="small">${F.leader}, ${F.personality ? REALM_PERSONALITY[F.personality].deal.toLowerCase() : ''}.</p>
        <div class="opts"><button class="wax" data-l="yes"><b>${yes}</b></button>${no ? `<button data-l="no"><b>${no}</b></button>` : ''}</div></div>`;
      return;
    }
    if (res) {
      modal.innerHTML = `<div class="sheet parch"><h2 style="color:${res.won ? '#2b2118' : '#9b2d20'}">${res.title}</h2><p>${res.text}</p>
        <div class="stats">${res.rows.map(([a, b]) => `<span>${a}</span><b>${b}</b>`).join('')}</div>
        <div class="btns"><button class="wax" data-x="ok">Back to the realm</button></div></div>`;
    }
  }
  modal.addEventListener('click', (e) => {
    const b = e.target.closest('button'); if (!b || G.mode !== 'realm') return;
    const R = G.realm;
    if (b.dataset.e) { const E = R.engagements.find((x) => x.status === 'pending'); if (E) G.engageChoice(E.id, b.dataset.e); sig.modal = null; return; }
    if (b.dataset.l) { const L = R.letters.find((l) => l.to === me().id && !G.letterSeen?.[l.id]); if (L) G.answerLetter(L.id, b.dataset.l === 'yes'); sig.modal = null; return; }
    // (null, not '': '' would match "nothing to show" and the sheet would never close)
    if (b.dataset.x) { G.rResult = null; sig.modal = null; }
  });

  // ---------------------------------------------------------------- The Court (DESIGN.md 20.7)
  function toggleCourt(on) { G.courtOpen = on === undefined ? !G.courtOpen : on; if (G.courtOpen && G.courtSel === undefined) G.courtSel = G.realm.main; sig.court = ''; sig.top = ''; }
  const DEALS = [
    ['truce', 'Truce', 'Stop the war for two seasons'], ['peace', 'Peace', 'End the war (white peace)'], ['peaceGold', 'Peace + gold', 'End it, and they pay'], ['peaceLand', 'Peace + land', 'End it, and they cede a province'],
    ['nap', 'Pact', 'A pact of peace for four years'], ['trade', 'Trade', '+10% income for both'], ['access', 'Access', 'March through their land'],
    ['defAlliance', 'Def. alliance', 'Each defends the other'], ['alliance', 'Alliance', 'Their wars are yours, yours theirs'],
    ['tribute', 'Demand tribute', 'They pay 10,000 g now'], ['gift', 'Gift', 'Send 5,000 g for their goodwill'], ['payAttack', 'Pay to attack', '15,000 g: they march on a rival'],
    ['vassal', 'Vassalage', 'They bend the knee'], ['war', 'Declare war', 'Break the peace (they remember)'],
  ];
  function dealOf(id, target) {
    const R = G.realm;
    if (id === 'peaceGold') return { type: 'peace', demandGold: 15000 };
    if (id === 'peaceLand') { const land = R.provinces.filter((p) => p.owner === G.courtSel && p.neighbors.some((n) => R.provinces[n].owner === me().id) && p.seat !== 'capital').map((p) => p.id).slice(0, 1); return { type: 'peace', demandProvinces: land }; }
    if (id === 'tribute') return { type: 'tribute', gold: 10000 };
    if (id === 'gift') return { type: 'gift', gold: 5000 };
    if (id === 'payAttack') return { type: 'payAttack', gold: 15000, target };
    if (id === 'truce') return { type: 'truce', seasons: 2 };
    return { type: id };
  }
  function renderCourt() {
    if (!G.courtOpen || G.mode !== 'realm') { if (sig.court !== 'off') { sig.court = 'off'; court.className = 'parch'; court.innerHTML = ''; } return; }
    const R = G.realm, k = me();
    const others = R.kingdoms.filter((x) => x.alive && x.id !== k.id);
    if (!others.some((x) => x.id === G.courtSel)) G.courtSel = others[0] ? others[0].id : -1;
    const T = G.courtSel >= 0 ? K(G.courtSel) : null;
    const s = [R.day, G.courtSel, G.courtDeal, G.courtTarget, G.courtMsg, Math.floor(k.gold / 1000)].join('|');
    if (s === sig.court) return; sig.court = s;
    court.className = 'parch show';
    const atW = R.kingdoms.filter((x) => x.alive && x.id !== k.id && atWar(R, k.id, x.id)).length;
    let detail = '';
    if (T) {
      const O = opinion(R, T.id, k.id, true);
      const P = personality(R, T.id);
      const trts = (T.traits || []).join(', ');
      const ts = R.treaties.filter((t) => (t.a === k.id && t.b === T.id) || (t.b === k.id && t.a === T.id)).map((t) => ({ nap: 'Pact of peace', trade: 'Trade', access: 'Military access', defAlliance: 'Defensive alliance', alliance: 'Full alliance', vassal: t.a === k.id ? 'Your vassal' : 'Your liege' }[t.type]));
      const r = rel(R, k.id, T.id);
      const deal = G.courtDeal ? (G.courtDeal === 'war' ? null : dealOf(G.courtDeal, G.courtTarget)) : null;
      const J = deal ? judge(R, k.id, T.id, deal) : null;
      const moods = ['Refuse', 'Unlikely', 'Maybe', 'Likely', 'Eager'];
      detail = `<div class="ch"><i class="crest" style="background:${hex(T.main)};border-color:${hex(T.trim)}"></i><div><h3 class="cinzel">${T.leader}</h3><small>${T.name} · ${T.personality ? T.personality[0].toUpperCase() + T.personality.slice(1) : ''}${trts ? ', ' + trts : ''}</small></div></div>
        <div class="obar"><div class="track"><i style="left:${50 + O.v / 2}%"></i></div><span>${O.v > 0 ? '+' : ''}${O.v} ${moodWord(O.v)}</span></div>
        <div class="reasons">${O.reasons.slice(0, 5).map(([v, t]) => `<div class="${v < 0 ? 'neg' : 'pos'}"><b>${v > 0 ? '+' : ''}${v}</b> ${t}</div>`).join('') || '<div class="muted">They hardly know you.</div>'}</div>
        <div class="facts"><span>${r.state === 'war' ? 'At war · score ' + (scoreFor(R, k.id, T.id) > 0 ? '+' : '') + scoreFor(R, k.id, T.id) : r.state === 'truce' ? 'Truce · ' + Math.max(0, r.until - R.day) + ' days' : 'At peace'}</span><span>Their weariness ${Math.round(T.exhaustion || 0)}</span><span>Strength ${(strength(R, T.id) / Math.max(1, strength(R, k.id))).toFixed(1)}×</span><span>Trust ${Math.round(T.trust)}</span></div>
        ${ts.length ? `<div class="facts">${ts.map((x) => `<span class="tr">${x}</span>`).join('')}</div>` : ''}
        <div class="propose"><div class="lbl">Propose</div><div class="deals">${DEALS.map(([id, n, d]) => `<button data-deal="${id}" class="${G.courtDeal === id ? 'on' : ''}${id === 'war' ? ' danger' : ''}" title="${d}">${n}</button>`).join('')}</div>
        ${G.courtDeal === 'payAttack' ? `<div class="pick">March on: ${others.filter((x) => x.id !== T.id && !x.landless).map((x) => `<button data-tgt="${x.id}" class="${G.courtTarget === x.id ? 'on' : ''}">${x.short}</button>`).join('')}</div>` : ''}
        ${J ? `<div class="mood"><span class="lbl">Their mood</span>${moods.map((m) => `<span class="${m === J.word ? 'on' : ''}">${m}</span>`).join('')}</div><div class="why">${J.reasons.map((x) => '"' + x + '"').join(' · ')}</div>` : ''}
        ${G.courtDeal ? `<button class="wax send" data-send="1">${G.courtDeal === 'war' ? 'Declare war' : 'Send the envoy'}</button>` : ''}
        ${G.courtMsg ? `<div class="msg">${G.courtMsg}</div>` : ''}</div>`;
    }
    court.innerHTML = `<h2 class="cinzel">The Court <small>${k.short} · trust ${Math.round(k.trust)} · ${atW ? 'at war with ' + atW : 'at peace'}</small><button class="x" data-c="close">✕</button></h2>
      <div class="cols"><div class="kl">${others.map((x) => { const st = stateWord(R, k.id, x.id); const o = opinion(R, x.id, k.id); return `<button data-c="${x.id}" class="${x.id === G.courtSel ? 'on' : ''}"><i style="background:${hex(x.main)}"></i><span class="n">${x.id === R.main ? '♛ ' : ''}${x.short}</span><span class="st ${st.toLowerCase().replace(/[^a-z]/g, '')}">${st}</span><span class="o ${o < -10 ? 'neg' : o > 10 ? 'pos' : ''}">${o > 0 ? '+' : ''}${o}</span></button>`; }).join('')}
        <div class="letters">${R.letters.filter((l) => l.to === k.id).length} envoy letter(s) waiting</div></div>
        <div class="kd">${detail}</div></div>`;
  }
  court.addEventListener('click', (e) => {
    const b = e.target.closest('button'); if (!b || G.mode !== 'realm') return;
    if (b.dataset.c === 'close') { toggleCourt(false); return; }
    if (b.dataset.c !== undefined) { G.courtSel = +b.dataset.c; G.courtDeal = null; G.courtMsg = ''; sig.court = ''; return; }
    if (b.dataset.deal) { G.courtDeal = G.courtDeal === b.dataset.deal ? null : b.dataset.deal; G.courtMsg = ''; if (G.courtDeal === 'payAttack' && G.courtTarget === undefined) G.courtTarget = G.realm.main === G.courtSel ? null : G.realm.main; sig.court = ''; return; }
    if (b.dataset.tgt) { G.courtTarget = +b.dataset.tgt; sig.court = ''; return; }
    if (b.dataset.send) {
      const r = G.courtDeal === 'war' ? G.realmCmd('declare', G.courtSel) : G.realmCmd('propose', G.courtSel, dealOf(G.courtDeal, G.courtTarget));
      G.courtMsg = r ? (r.error || (r.ok ? (G.courtDeal === 'war' ? 'War is declared.' : 'They accept.') : r.sent ? 'The envoy rides out.' : 'They refuse.')) : '';
      sig.court = '';
    }
  });

  // ---------------------------------------------------------------- input from the map
  function click(cx, cy) {
    const R = G.realm;
    const g = G.groundAt(cx, cy);
    if (!g) { G.rSel = null; return; }
    const A = G.rv.armyAt(g[0], g[2]);
    if (A && visibleTo(R, me().id, A)) { G.rSel = { army: A.id }; G.rv.showPath(A.edge ? A.edge.from : A.prov, A.edge ? [A.edge.to, ...A.path] : A.path, A.kingdom === me().id ? 0xfff1c4 : 0xff8866); return; }
    const p = G.rv.provinceAt(g[0], g[2]);
    G.rSel = p >= 0 ? { prov: p } : null;
    G.rv.showPath(null);
  }
  function rightClick(cx, cy) {
    const R = G.realm;
    const A = G.rSel && G.rSel.army ? R.armies.find((x) => x.id === G.rSel.army) : null;
    if (!A || A.kingdom !== me().id) return;
    const g = G.groundAt(cx, cy); if (!g) return;
    const p = G.rv.provinceAt(g[0], g[2]); if (p < 0) return;
    const P = R.provinces[p];
    const type = P.owner === me().id ? 'march' : (P.owner < 0 || atWar(R, me().id, P.owner)) ? 'attack' : 'march';
    G.realmCmd('order', A.id, type, p);
  }
  function hover(cx, cy) { /* labels carry the names; nothing to do */ }

  function reset() { sig = {}; for (const el of lab.values()) el.remove(); lab.clear(); modal.className = ''; modal.innerHTML = ''; court.className = 'parch'; court.innerHTML = ''; }
  function hide() { reset(); left.className = 'empty'; left.innerHTML = ''; right.innerHTML = ''; bottom.innerHTML = ''; bottom.className = ''; top.innerHTML = ''; }
  function update() {
    if (G.mode !== 'realm' || !G.realm) return;
    renderTop(); renderLeft(); renderRight(); renderBottom(); renderModal(); renderCourt(); renderLabels();
  }
  return { update, reset, hide, click, rightClick, hover, toggleCourt };
}
export { findPath, pathDays, edgeBetween, allies, dateText, seasonIncome, seasonUpkeep };
