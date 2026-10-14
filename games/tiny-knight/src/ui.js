// DOM UI: HUD, menus (craft / shop / bridge / bag / map / pause / results), toasts, touch controls.
import { G, craft, sell, buy, buildBridge, canAfford, objective, retry, newGame, load, save, hasSave, wipeSave, weaponDmg, defense, isNight, ZONE_NAMES, Z, TS, N, RECIPES, BRIDGE, SELL, MATS, SWORDS, AXES, PICKS, ARMORS, SHIELDS } from './game.js';
import { MAT_NAME, xpNeeded, maxHpFor, atkBonus } from './data.js';
import { iconURL } from './sprites.js';
import { sfx, audio, setMuted, initAudio, playMusic } from './audio.js';
import { minimap } from './render.js';

const $ = (s) => document.querySelector(s);
const el = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; };
const img = (name, cls = 'ic') => `<img class="${cls}" src="${iconURL(name)}" alt="">`;
const fmtTime = (s) => { s = Math.floor(s); const h = Math.floor(s / 3600), m = Math.floor(s / 60) % 60, ss = s % 60; return (h ? h + ':' + String(m).padStart(2, '0') : m) + ':' + String(ss).padStart(2, '0'); };

export const ui = {
  menu: null, sel: 0, onStart: null,
  toast(msg, kind = '') {
    const box = $('#toasts'); const t = el('div', 'toast ' + kind, msg); box.appendChild(t);
    while (box.children.length > 4) box.firstChild.remove();
    setTimeout(() => t.classList.add('out'), 2600); setTimeout(() => t.remove(), 3100);
  },
  gain(mat, n) {
    const box = $('#gains'); let row = box.querySelector(`[data-m="${mat}"]`);
    if (!row) { row = el('div', 'gain'); row.dataset.m = mat; row.dataset.n = 0; box.appendChild(row); }
    row.dataset.n = +row.dataset.n + n; row.innerHTML = `${img(mat)} +${row.dataset.n} ${MAT_NAME[mat] || mat}`;
    row.classList.remove('out'); clearTimeout(row._t); row._t = setTimeout(() => { row.classList.add('out'); setTimeout(() => row.remove(), 400); }, 1800);
  },
  banner(big, small = '', dur = 2) {
    const b = $('#banner'); b.innerHTML = `<div class="big">${big}</div><div class="small">${small}</div>`;
    b.classList.remove('show'); void b.offsetWidth; b.classList.add('show');
    clearTimeout(b._t); b._t = setTimeout(() => b.classList.remove('show'), dur * 1000);
  },
  zoneBanner(name, tier) {
    const b = $('#zone'); b.innerHTML = `<span>${name}</span>${tier ? `<em>${'★'.repeat(tier)}</em>` : '<em>safe</em>'}`;
    b.classList.remove('show'); void b.offsetWidth; b.classList.add('show');
    clearTimeout(b._t); b._t = setTimeout(() => b.classList.remove('show'), 2200);
  },
  hurt() { const v = $('#vignette'); v.classList.remove('hit'); void v.offsetWidth; v.classList.add('hit'); },

  // ---------- menus ----------
  open(kind, obj) {
    if (kind !== 'dead' && kind !== 'victory' && kind !== 'title' && G.state !== 'play' && G.state !== 'menu') return;
    if (kind === 'craft' || kind === 'bag' || kind === 'shop' || kind === 'bridge' || kind === 'sage' || kind === 'sign' || kind === 'pause' || kind === 'map') G.state = 'menu';
    this.menu = kind; this.obj = obj; this.sel = 0; sfx('ui');
    this.draw();
    $('#panel').classList.remove('hidden');
  },
  close() {
    if (!this.menu) return;
    const k = this.menu; this.menu = null; $('#panel').classList.add('hidden'); $('#panel').innerHTML = '';
    if (k !== 'dead' && k !== 'victory' && k !== 'title' && G.state === 'menu') G.state = 'play';
    sfx('ui');
  },
  draw() {
    const P = $('#panel'), p = G.player, k = this.menu; P.innerHTML = '';
    const box = el('div', 'box ' + k); P.appendChild(box);
    const keep = this.sel;
    const head = (title, sub) => box.appendChild(el('div', 'head', `<h2>${title}</h2>${sub ? `<p>${sub}</p>` : ''}<button class="x nav-skip" data-act="close">✕</button>`));
    const coinLine = () => `<div class="coins">${img('coin')} <b>${p.coins}</b></div>`;
    const matsGrid = (sellable) => {
      const g = el('div', 'mats');
      for (const m of MATS) {
        const c = el('div', 'mat' + (p.inv[m] ? '' : ' none'), `${img(m)}<span>${MAT_NAME[m]}</span><b>${p.inv[m]}</b>` + (sellable ? `<button class="nav sm" data-act="sell1" data-m="${m}" ${p.inv[m] ? '' : 'disabled'}>Sell 1 · ${SELL[m]}c</button><button class="nav sm" data-act="sellall" data-m="${m}" ${p.inv[m] ? '' : 'disabled'}>All · ${SELL[m] * p.inv[m]}c</button>` : ''));
        g.appendChild(c);
      }
      return g;
    };
    const costHTML = (cost) => Object.entries(cost).map(([m, n]) => { const have = m === 'coins' ? p.coins : p.inv[m]; return `<span class="cost ${have >= n ? 'ok' : 'no'}">${img(m === 'coins' ? 'coin' : m)}${have}/${n}</span>`; }).join('');
    if (k === 'craft' || k === 'bag') {
      head(k === 'craft' ? 'Workbench' : 'Bag', k === 'craft' ? 'Craft gear from what you gather' : 'Crafting needs a workbench (town or lake camp)');
      const gear = el('div', 'gear');
      const gearItem = (icon, name, stat) => `<div class="gi">${img(icon)}<div><b>${name}</b><span>${stat}</span></div></div>`;
      gear.innerHTML = gearItem(SWORDS[p.sword].icon, SWORDS[p.sword].name, `${weaponDmg(p)} dmg`) + gearItem(AXES[p.axe].icon, AXES[p.axe].name, `chop x${AXES[p.axe].pow}`) +
        gearItem(PICKS[p.pick].icon, PICKS[p.pick].name, p.pick ? `mine x${PICKS[p.pick].pow}` : 'cannot mine') + gearItem(ARMORS[p.armor].icon, ARMORS[p.armor].name, p.armor ? `-${defense(p)} dmg taken` : 'no protection') +
        (p.shield ? gearItem(SHIELDS[p.shield].icon, SHIELDS[p.shield].name, `blocks ${Math.round(SHIELDS[p.shield].block * 100)}%`) : '') + (p.bow ? gearItem('bow', 'Bow', `${p.arrows} arrows`) : '') + gearItem('potion', 'Potions', `${p.potions} (Q)`);
      const cols = el('div', 'cols'); box.appendChild(cols);
      const left = el('div', 'col'); left.appendChild(el('div', 'sub', `Level ${p.lvl} · HP ${Math.ceil(p.hp)}/${maxHpFor(p.lvl)} ${coinLine()}`)); left.appendChild(gear); left.appendChild(matsGrid(false)); cols.appendChild(left);
      const right = el('div', 'col recipes'); cols.appendChild(right);
      const list = RECIPES.filter((r) => !(r.have && r.have(p)));
      for (const r of list) {
        const ok = canAfford(r.cost) && (!r.need || r.need(p));
        const row = el('div', 'recipe' + (ok ? ' ok' : ''), `${img(r.icon, 'ic big')}<div class="rt"><b>${r.name}</b><span>${r.desc}</span><div class="costs">${costHTML(r.cost)}</div></div>` +
          (k === 'craft' ? `<button class="nav ${ok ? 'go' : ''}" data-act="craft" data-id="${r.id}" ${ok ? '' : 'aria-disabled="true"'}>${ok ? 'Craft' : 'Need'}</button>` : ''));
        right.appendChild(row);
      }
      if (!list.length) right.appendChild(el('p', 'note', 'You have crafted everything!'));
    } else if (k === 'shop') {
      head('Pip\'s Stall', 'Sell spare loot, buy supplies');
      box.appendChild(el('div', 'sub', coinLine()));
      const buyRow = el('div', 'buyrow');
      buyRow.innerHTML = `<button class="nav go" data-act="buy" data-w="potion">${img('potion')} Potion · 15c</button><button class="nav go" data-act="buy" data-w="arrows">${img('arrow')} 10 Arrows · 8c</button>`;
      box.appendChild(buyRow); box.appendChild(matsGrid(true));
    } else if (k === 'bridge') {
      const st = G.world.bridgeStage;
      head('Foreman Bram', st >= 5 ? 'The bridge is finished. Go get \'em, little knight!' : `"Fund a stage and my crew builds it right away." Stage ${st}/5`);
      const prog = el('div', 'bprog'); for (let i = 0; i < 5; i++) prog.appendChild(el('div', 'seg' + (i < st ? ' done' : i === st ? ' next' : ''), img('bridge') + `<span>${i + 1}</span>`)); box.appendChild(prog);
      box.appendChild(el('div', 'sub', coinLine()));
      if (st < 5) {
        const c = BRIDGE[st], ok = canAfford(c);
        box.appendChild(el('div', 'recipe' + (ok ? ' ok' : ''), `${img('bridge', 'ic big')}<div class="rt"><b>Stage ${st + 1}</b><span>${['Pilings and the first planks', 'Deck out to the reeds', 'Halfway! Rails and lanterns', 'Iron braces for the deep water', 'The last span to the castle'][st]}</span><div class="costs">${costHTML(c)}</div></div><button class="nav ${ok ? 'go' : ''}" data-act="build">${ok ? 'Build!' : 'Need'}</button>`));
        box.appendChild(el('p', 'note', 'Coins come from monsters, treasure chests and selling at Pip\'s stall in Oakhaven.'));
      }
    } else if (k === 'sage' || k === 'sign') {
      const o = objective();
      const tips = ['Roll (K / right click) through attacks: you are invincible mid-roll.', 'Every third swing in a combo is a big finisher.', 'A shield blocks hits from the direction you face.', 'Skeleton bones can be knocked away with your sword.', 'Nights are dangerous: more zombies and bats roam.', 'Rocklings look just like rocks. Watch for yellow eyes!', 'Shadow Knights draw a red line before they dash. Step aside!', 'Treasure chests hide in every zone. Check the map (M).'];
      head(k === 'sage' ? 'Old Sage Wren' : 'Signpost');
      box.appendChild(el('p', 'talk', k === 'sign' ? this.obj.text : `"${o ? o.text + '.' : ''}"<br><br>"${tips[Math.floor(Math.random() * tips.length)]}"`));
      box.appendChild(el('div', 'btns', '<button class="nav go" data-act="close">OK</button>'));
    } else if (k === 'map') {
      head('Island Map', `${ZONE_NAMES[G.world.zoneAt(p.x, p.y)]} · ${isNight() ? 'Night' : 'Day'}`);
      const wrap = el('div', 'mapwrap'); const c = document.createElement('canvas'); c.width = N; c.height = N; const g = c.getContext('2d');
      g.drawImage(minimap(), 0, 0);
      g.fillStyle = '#ffcd75'; for (const o of G.world.objs) if (o.kind === 'chest' && !o.open) g.fillRect(o.tx - 1, o.ty - 1, 3, 3);
      g.fillStyle = '#b13e53'; g.fillRect(Math.floor(p.x / TS) - 2, Math.floor(p.y / TS) - 2, 5, 5); g.fillStyle = '#f4f4f4'; g.fillRect(Math.floor(p.x / TS) - 1, Math.floor(p.y / TS) - 1, 3, 3);
      wrap.appendChild(c);
      const lbl = [['Oakhaven', 80, 140], ['Sunny Meadow', 80, 150], ['Whisperwood ★★', 22, 80], ['Pebble Hills ★★★', 136, 80], ['Hollow Graves ★★★★', 80, 14], ['Shadow Castle', 80, 66]];
      for (const [t, x, y] of lbl) { const s = el('span', 'mlabel', t); s.style.left = (x / N * 100) + '%'; s.style.top = (y / N * 100) + '%'; wrap.appendChild(s); }
      box.appendChild(wrap); box.appendChild(el('p', 'note', 'Gold squares are unopened treasure chests.'));
    } else if (k === 'pause') {
      head('Paused', `Played ${fmtTime(G.stats.time)} · Level ${p.lvl}`);
      box.appendChild(el('div', 'btns col', `<button class="nav go" data-act="close">Resume</button><button class="nav" data-act="mute">${audio.muted ? 'Sound: OFF' : 'Sound: ON'}</button><button class="nav" data-act="title">Save &amp; Quit to Title</button>`));
      box.appendChild(el('div', 'controls', CONTROLS));
    } else if (k === 'dead') {
      box.appendChild(el('div', 'result', `<h1 class="bad">YOU FELL</h1><p>The shadows win this round. You keep your gear; Pip charges 10% of your coins to patch you up.</p>${statsHTML()}`));
      box.appendChild(el('div', 'btns col', '<button class="nav go huge" data-act="retry">RETRY</button><button class="nav" data-act="title">Title</button>'));
    } else if (k === 'victory') {
      box.appendChild(el('div', 'result', `<h1 class="good">VICTORY!</h1><p>Umbra, the Shadow King, is defeated. Light returns to Moonlake Castle and the island is safe.</p>${statsHTML()}`));
      box.appendChild(el('div', 'btns col', '<button class="nav go huge" data-act="freeplay">KEEP PLAYING</button><button class="nav" data-act="newgame">New Adventure</button><button class="nav" data-act="title">Title</button>'));
    } else if (k === 'title') {
      const has = hasSave();
      box.appendChild(el('div', 'logo', '<div class="t1">TINY</div><div class="t2">KNIGHT</div><div class="tag">Chop · Craft · Fight · Build the bridge · Beat the Shadow King</div>'));
      box.appendChild(el('div', 'btns col', `<button class="nav go huge" data-act="play">${has ? 'CONTINUE' : 'PLAY'}</button>${has ? '<button class="nav" data-act="newgame">New Game</button>' : ''}<button class="nav" data-act="mute">${audio.muted ? 'Sound: OFF' : 'Sound: ON'}</button>`));
      box.appendChild(el('div', 'controls', CONTROLS));
    }
    box.addEventListener('click', (ev) => { const b = ev.target.closest('button'); if (b) this.act(b); });
    const navs = this.navs(); this.sel = Math.min(keep, Math.max(0, navs.length - 1)); this.hilite();
  },
  navs() { return [...$('#panel').querySelectorAll('button.nav:not([disabled])')]; },
  hilite() { const n = this.navs(); n.forEach((b, i) => b.classList.toggle('sel', i === this.sel)); const b = n[this.sel]; if (b && b.scrollIntoView) b.scrollIntoView({ block: 'nearest' }); },
  key(code) {
    const n = this.navs();
    if (code === 'up' || code === 'left') { this.sel = (this.sel - 1 + n.length) % n.length; this.hilite(); sfx('ui'); }
    else if (code === 'down' || code === 'right') { this.sel = (this.sel + 1) % n.length; this.hilite(); sfx('ui'); }
    else if (code === 'ok') { if (n[this.sel]) this.act(n[this.sel]); }
    else if (code === 'back') { if (['craft', 'bag', 'shop', 'bridge', 'sage', 'sign', 'pause', 'map'].includes(this.menu)) this.close(); }
  },
  act(b) {
    initAudio();
    const a = b.dataset.act;
    if (a === 'close') return this.close();
    if (a === 'craft') { craft(b.dataset.id); return this.draw(); }
    if (a === 'sell1' || a === 'sellall') { sell(b.dataset.m, a === 'sellall'); return this.draw(); }
    if (a === 'buy') { buy(b.dataset.w); return this.draw(); }
    if (a === 'build') { if (buildBridge()) { this.draw(); if (G.world.bridgeStage >= 5) setTimeout(() => this.menu === 'bridge' && this.close(), 600); } else this.draw(); return; }
    if (a === 'mute') { setMuted(!audio.muted); return this.draw(); }
    if (a === 'retry') { this.close(); retry(); return; }
    if (a === 'freeplay') { this.close(); G.flags.freeplay = true; G.state = 'play'; save(); return; }
    if (a === 'title') { save(); this.close(); G.state = 'title'; this.open('title'); return; }
    if (a === 'play') { this.close(); this.onStart && this.onStart(hasSave() ? 'continue' : 'new'); return; }
    if (a === 'newgame') {
      if (b.dataset.confirm !== '1' && hasSave() && !G.flags?.victory) { b.dataset.confirm = '1'; b.textContent = 'Erase save? Tap again'; return; }
      wipeSave(); this.close(); this.onStart && this.onStart('new'); return;
    }
  },

  // ---------- HUD ----------
  hud() {
    const p = G.player; if (!p) return;
    const mh = maxHpFor(p.lvl);
    set('#hpfill', 'style.width', Math.max(0, p.hp / mh * 100) + '%');
    set('#hptext', 'textContent', `${Math.ceil(Math.max(0, p.hp))}/${mh}`);
    set('#xpfill', 'style.width', (p.xp / xpNeeded(p.lvl) * 100) + '%');
    set('#lvl', 'textContent', 'Lv ' + p.lvl);
    set('#coins', 'textContent', p.coins);
    set('#potions', 'textContent', p.potions);
    set('#arrows', 'textContent', p.bow ? p.arrows : '-');
    for (const m of ['wood', 'stone', 'iron']) set('#m-' + m, 'textContent', p.inv[m]);
    const o = objective();
    set('#objtext', 'innerHTML', o ? o.text + (o.prog ? ` <b>${o.prog}</b>` : '') : '');
    // interact prompt
    const it = G.interactTarget;
    let pr = '';
    if (it && G.state === 'play') {
      const verbs = { chop: 'Chop tree', mine: it.ore === 1 ? 'Mine iron ore' : 'Mine rock', chest: 'Open chest', craft: 'Use workbench', shop: 'Trade with Pip', bridge: 'Talk to Foreman Bram', sage: 'Talk to Sage Wren', sign: 'Read sign' };
      pr = `<kbd>E</kbd> ${verbs[it.interact] || 'Interact'}`;
      if (it.interact === 'mine' && p.pick < (it.ore === 1 ? 2 : 1)) pr += ` <i>(needs ${it.ore === 1 ? 'Stone' : 'a'} Pickaxe)</i>`;
    }
    set('#prompt', 'innerHTML', pr); $('#prompt').classList.toggle('show', !!pr);
    // boss bar
    const b = G.boss;
    $('#bossbar').classList.toggle('show', !!(b && b.alive));
    if (b && b.alive) { set('#bossfill', 'style.width', Math.max(0, b.hp / b.maxHp * 100) + '%'); set('#bossname', 'textContent', 'UMBRA, THE SHADOW KING' + (b.phase > 1 ? ' · PHASE ' + b.phase : '')); }
    set('#mutebtn', 'textContent', audio.muted ? '🔇' : '🔊');
    // minimap corner
    const mm = $('#mini'); if (mm && G.time % 0.25 < 0.02) {
      const g = mm.getContext('2d'); const r = 24, ptx = Math.floor(p.x / TS), pty = Math.floor(p.y / TS);
      g.imageSmoothingEnabled = false; g.fillStyle = '#29366f'; g.fillRect(0, 0, 48, 48);
      g.drawImage(minimap(), ptx - r, pty - r, r * 2, r * 2, 0, 0, 48, 48);
      g.fillStyle = '#ffcd75'; for (const ob of G.world.objs) if (ob.kind === 'chest' && !ob.open && Math.abs(ob.tx - ptx) < r && Math.abs(ob.ty - pty) < r) g.fillRect(ob.tx - ptx + r - 1, ob.ty - pty + r - 1, 2, 2);
      g.fillStyle = '#b13e53'; for (const e of G.enemies) { const ex = Math.floor(e.x / TS) - ptx + r, ey = Math.floor(e.y / TS) - pty + r; if (ex >= 0 && ey >= 0 && ex < 48 && ey < 48) g.fillRect(ex, ey, 1, 1); }
      g.fillStyle = '#f4f4f4'; g.fillRect(r - 1, r - 1, 3, 3);
    }
  },
};
const last = new Map();
function set(sel, prop, val) {
  const key = sel + prop; if (last.get(key) === val) return; last.set(key, val);
  const e = $(sel); if (!e) return;
  if (prop === 'style.width') e.style.width = val; else e[prop] = val;
}
function statsHTML() {
  const s = G.stats, p = G.player;
  return `<div class="stats"><div><b>${fmtTime(s.time)}</b><span>time</span></div><div><b>${p.lvl}</b><span>level</span></div><div><b>${s.kills}</b><span>monsters</span></div><div><b>${s.chopped}</b><span>trees</span></div><div><b>${s.mined}</b><span>rocks</span></div><div><b>${s.crafted}</b><span>crafted</span></div><div><b>${G.world.bridgeStage}/5</b><span>bridge</span></div><div><b>${s.deaths}</b><span>falls</span></div></div>`;
}
const CONTROLS = `<div class="ctl"><b>WASD</b> move</div><div class="ctl"><b>J</b> / click attack</div><div class="ctl"><b>K</b> / right-click roll</div><div class="ctl"><b>E</b> chop · mine · talk</div><div class="ctl"><b>L</b> / F bow</div><div class="ctl"><b>Q</b> potion</div><div class="ctl"><b>I</b> / Tab bag</div><div class="ctl"><b>M</b> map</div><div class="ctl"><b>Esc</b> pause · <b>N</b> mute</div>`;
