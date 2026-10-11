// HTML overlays: title, decks, collection, pause, round cash-out, shop, run over.
// Card art is painted into small canvases with the same draw.js code as the game.
import * as E from './engine.js';
import { CHARMS, byId, glyphById, GLYPHS, DECKS, deckById, STAKES, ACHIEVEMENTS, RARITY, ROUND_NAMES, bossById, FAMILIES, ANTES, XP_PER_LEVEL, COLORS } from './data.js';
import { charmCard, glyphStone, pieceShape, rrect, fmt, emblem } from './draw.js';

const h = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html !== undefined) e.innerHTML = html; return e; };
const DPR = () => Math.min(devicePixelRatio || 1, 2);
function cardCanvas(w, hgt, paint) {
  const c = document.createElement('canvas'), d = DPR();
  c.width = Math.round(w * d); c.height = Math.round(hgt * d); c.style.width = w + 'px'; c.style.height = hgt + 'px';
  const g = c.getContext('2d'); g.scale(d, d); paint(g);
  return c;
}
export const charmCanvas = (id, w, opts = {}) => cardCanvas(w, w * 1.4, g => charmCard(g, 0, 0, w, w * 1.4, byId[id], { t: 0.5, ...opts }));
const glyphCanvas = (id, r) => cardCanvas(r * 2 + 8, r * 2 + 8, g => glyphStone(g, r + 4, r + 4, r, glyphById[id]));
const DECK_ICON = { jewel: 'stone', tetro: 'square', big: 'bar', gem: 'prism', gilded: 'coin', tinker: 'spiral' };

export class UI {
  constructor(game) {
    this.G = game; this.root = document.getElementById('ui'); this.open = false; this.panel = null; this.sel = -1;
    this.toasts = h('div', 'toasts'); document.body.appendChild(this.toasts);
    this.tq = []; this.tbusy = false;
  }
  hide() { this.root.innerHTML = ''; this.open = false; this.panel = null; }
  show(panel, data) {
    this.root.innerHTML = ''; this.open = true; this.panel = panel; this.data = data;
    const fn = this['p_' + panel]; fn.call(this, data);
  }
  click(s = 'click') { this.G.snd.unlock(); this.G.snd.play(s); }
  btn(label, cls, fn, sub) {
    const b = h('button', 'btn ' + (cls || ''), label + (sub ? `<small>${sub}</small>` : ''));
    b.addEventListener('click', e => { e.stopPropagation(); this.click(); fn(); });
    return b;
  }
  key(e) {
    const k = e.code;
    if (this.panel === 'over') { if (k === 'KeyR' || k === 'Enter' || k === 'Space') { e.preventDefault(); this.G.start(this.G.run?.mode === 'zen' ? 'zen' : this.G.run?.mode === 'daily' ? 'daily' : 'run'); } else if (k === 'Escape') this.show('title'); return; }
    if (this.panel === 'pause' && (k === 'Escape' || k === 'KeyP')) { this.resume(); return; }
    if (this.panel === 'cash' && (k === 'Enter' || k === 'Space')) { e.preventDefault(); this.root.querySelector('.btn.go')?.click(); return; }
    if (this.panel === 'shop') { if (k === 'Enter') { e.preventDefault(); this.root.querySelector('.btn.go')?.click(); } if (k === 'KeyR') this.root.querySelector('.btn.reroll')?.click(); if (k === 'Escape') this.show('pause'); return; }
    if (this.panel === 'title' && (k === 'Enter' || k === 'Space')) { e.preventDefault(); this.root.querySelector('.btn.play')?.click(); return; }
    if (['decks', 'collection', 'how', 'settings'].includes(this.panel) && k === 'Escape') this.back();
  }
  resume() { if (this.G.scene === 'shop') this.show(this.G.run?.shop ? 'shop' : 'title'); else if (this.G.scene === 'play') this.hide(); else this.show('title'); }
  back() {
    const s = this.G.scene;
    if (s === 'play' && this.prev === 'play') this.hide();
    else if ((s === 'play' || s === 'shop') && this.prev === 'pause') this.show('pause');
    else this.show('title');
  }
  // toasts are queued: one at a time, so two never stack over the same spot
  toast(text, col = '#fff') {
    this.tq.push({ text, col });
    if (!this.tbusy) this.nextToast();
  }
  nextToast() {
    const n = this.tq.shift(); if (!n) { this.tbusy = false; return; }
    this.tbusy = true;
    const t = h('div', 'toast', n.text); t.style.borderColor = n.col;
    this.toasts.appendChild(t);
    setTimeout(() => t.classList.add('out'), 2200); setTimeout(() => { t.remove(); this.nextToast(); }, 2600);
  }

  // ---------------------------------------------------------------- title
  p_title() {
    const G = this.G, S = G.save;
    G.scene = 'title'; this.prev = 'title';
    const wrap = h('div', 'scrim title');
    const box = h('div', 'titlebox');
    box.appendChild(h('div', 'logo', `<h1><span class="w1">BLOCK</span><span class="w2">ROYALE</span></h1><p>The block puzzle with a scoring engine. Clear lines, stack Mult, break the rules.</p>`));
    const menu = h('div', 'menu');
    if (S.run) {
      let info = '';
      try { const r = JSON.parse(S.run); info = `Ante ${r.ante} · ${ROUND_NAMES[r.ri]} · ${deckById[r.deckId].name}`; } catch (e) { /* bad save */ }
      menu.appendChild(this.btn('Continue', 'gold play', () => G.continueRun(), info));
    }
    menu.appendChild(this.btn('Play', S.run ? 'ruby' : 'ruby play', () => G.start('run'), `${deckById[S.deck].name} · ${STAKES[S.stake].n} Stake`));
    const row = h('div', 'row2');
    const dailyRec = (() => { const k = Object.keys(S.daily).sort().pop(); return k && S.daily[k] && k === todayKey() ? S.daily[k] : null; })();
    row.appendChild(this.btn('Daily', 'sapphire', () => G.start('daily'), dailyRec ? `best: ante ${dailyRec.ante}` : 'same seed for all'));
    row.appendChild(this.btn('Zen', 'teal', () => G.start('zen'), S.best.zen ? `best ${fmt(S.best.zen)}` : 'endless, relaxed'));
    menu.appendChild(row);
    const row2 = h('div', 'row3');
    row2.appendChild(this.btn('Decks', 'small', () => this.show('decks')));
    row2.appendChild(this.btn('Collection', 'small', () => this.show('collection')));
    row2.appendChild(this.btn('How to play', 'small', () => this.show('how')));
    menu.appendChild(row2);
    // a seed can be typed in for any run (Balatro's seeded runs), so a friend's run can be replayed
    const seedRow = h('div', 'seedrow');
    const inp = h('input'); inp.type = 'text'; inp.placeholder = 'Seed (optional)'; inp.maxLength = 24; inp.spellcheck = false;
    inp.addEventListener('keydown', e => { e.stopPropagation(); if (e.key === 'Enter' && inp.value.trim()) { this.click(); G.start('run', { seed: inp.value.trim() }); } });
    const go = this.btn('Play seed', 'small', () => { const v = inp.value.trim(); if (v) G.start('run', { seed: v }); else inp.focus(); });
    seedRow.appendChild(inp); seedRow.appendChild(go);
    menu.appendChild(seedRow);
    box.appendChild(menu);
    const lv = h('div', 'level');
    const need = S.level * XP_PER_LEVEL;
    lv.innerHTML = `<b>LEVEL ${S.level}</b><div class="bar"><i style="width:${Math.min(100, S.xp / need * 100)}%"></i></div><span>${S.xp}/${need} XP · best ante ${S.best.ante || '-'} · best hand ${fmt(S.best.hand)}</span>`;
    box.appendChild(lv);
    wrap.appendChild(box);
    const set = h('button', 'iconbtn gear', '⚙'); set.title = 'Settings';
    set.addEventListener('click', () => { this.click(); this.show('settings'); });
    wrap.appendChild(set);
    this.root.appendChild(wrap);
  }

  // ---------------------------------------------------------------- how to play
  p_how() {
    const c = this.card('How to play', () => this.back());
    c.body.innerHTML = `
      <div class="how"><b>Place</b><span>Drag a piece from the tray onto the 8x8 board (on touch it floats above your finger). Full rows and columns clear.</span></div>
      <div class="how"><b class="chip">Chips</b><span>Every cleared block is worth <em class="c">10 Chips</em> (gem blocks 30).</span></div>
      <div class="how"><b class="mult">Mult</b><span>1 + lines cleared at once + your <em>streak</em> (placements in a row that each clear something).</span></div>
      <div class="how"><b>Score</b><span><em class="c">Chips</em> × <em class="m">Mult</em>. Reach each round's target before your placements run out. Leftover placements become gold.</span></div>
      <div class="how"><b>Charms</b><span>Buy them in the shop between rounds. They trigger left to right, so put <em class="m">x Mult</em> charms last.</span></div>
      <div class="how"><b>Glyphs</b><span>One-shot tricks: rotate, redeal, bomb, undo and more. Tap a glyph, then a piece or the board.</span></div>
      <div class="how"><b>Antes</b><span>8 antes of Small, Big and Boss rounds. Bosses bend the rules.</span></div>
      <div class="how"><b>Keys</b><span>1/2/3 pick a piece, arrows or WASD move, Space places, Q/E rotate (with Rotate), 4/5 use glyphs, Z undo (with Undo), Esc pause, R new run.</span></div>`;
  }
  card(title, onClose, cls = '') {
    const wrap = h('div', 'scrim');
    const card = h('div', 'panel ' + cls);
    const head = h('header', '', `<h2>${title}</h2>`);
    if (onClose) { const x = h('button', 'iconbtn', '✕'); x.addEventListener('click', () => { this.click(); onClose(); }); head.appendChild(x); }
    const body = h('div', 'body');
    card.appendChild(head); card.appendChild(body); wrap.appendChild(card); this.root.appendChild(wrap);
    return { wrap, card, head, body };
  }

  // ---------------------------------------------------------------- settings / pause
  sliders(body) {
    const G = this.G;
    const mk = (label, key, sndKey) => {
      const row = h('label', 'set', `<span>${label}</span>`);
      const r = h('input'); r.type = 'range'; r.min = 0; r.max = 1; r.step = 0.05; r.value = G.save[key];
      r.addEventListener('input', () => { G.save[key] = +r.value; G.snd[sndKey] = +r.value; G.snd.apply(); G.persist(); });
      r.addEventListener('change', () => G.snd.play('coin'));
      row.appendChild(r); body.appendChild(row);
    };
    mk('Music', 'music', 'music'); mk('Sound', 'sfx', 'sfx');
    // game speed, like Balatro's 1x / 2x: scales every animation, including the scoring ticks and the slam
    const sp = h('div', 'set', '<span>Game speed</span>');
    const seg = h('div', 'seg');
    [1, 1.5, 2].forEach(v => {
      const b = h('button', 'segb' + ((G.save.speed || 1) === v ? ' on' : ''), `${v}x`);
      b.addEventListener('click', () => { this.click(); G.save.speed = v; G.save.speedSet = 1; G.persist(); seg.querySelectorAll('.segb').forEach(x => x.classList.toggle('on', +x.textContent.replace('x', '') === v)); });
      seg.appendChild(b);
    });
    sp.appendChild(seg); body.appendChild(sp);
    const tg = h('label', 'set', '<span>Music on</span>');
    const cb = h('input'); cb.type = 'checkbox'; cb.checked = G.save.musicOn;
    cb.addEventListener('change', () => { G.save.musicOn = cb.checked; G.snd.musicOn = cb.checked; G.snd.apply(); G.persist(); });
    tg.appendChild(cb); body.appendChild(tg);
    const mu = h('label', 'set', '<span>Mute everything</span>');
    const cm = h('input'); cm.type = 'checkbox'; cm.checked = G.snd.muted;
    cm.addEventListener('change', () => { G.snd.muted = cm.checked; G.snd.apply(); });
    mu.appendChild(cm); body.appendChild(mu);
  }
  p_settings() {
    const c = this.card('Settings', () => this.back(), 'small');
    this.sliders(c.body);
    const reset = this.btn('Reset all progress', 'small danger', () => {
      if (!confirm('Erase all progress, unlocks and the saved run?')) return;
      try { localStorage.removeItem('pd.block-royale'); } catch (e) { /* blocked */ }
      location.reload();
    });
    c.body.appendChild(h('div', 'gap'));
    c.body.appendChild(reset);
  }
  p_pause() {
    this.prev = 'pause';
    const G = this.G;
    const c = this.card('Paused', () => this.resume(), 'small');
    const m = h('div', 'menu');
    m.appendChild(this.btn('Resume', 'ruby', () => this.resume()));
    this.sliders(m);
    m.appendChild(this.btn('How to play', 'small', () => this.show('how')));
    const row = h('div', 'row2');
    row.appendChild(this.btn('New run', 'small', () => G.start(G.run?.mode || 'run')));
    row.appendChild(this.btn('Menu', 'small', () => { G.saveRun(); this.show('title'); }, G.run?.mode === 'zen' ? '' : 'run is saved'));
    m.appendChild(row);
    c.body.appendChild(m);
    if (G.run && G.run.mode !== 'zen') {
      const note = h('p', 'note seednote', `Seed <b>${G.run.seed}</b> · ${deckById[G.run.deckId].name} · ${STAKES[G.run.stake].n} Stake `);
      note.appendChild(this.btn('Copy seed', 'mini', () => { try { navigator.clipboard.writeText(G.run.seed); this.toast('Seed copied', '#7ee05a'); } catch (e) { this.toast('Copy failed', '#ff4d6d'); } }));
      c.body.appendChild(note);
    }
  }

  // ---------------------------------------------------------------- decks
  p_decks() {
    const G = this.G, S = G.save;
    const c = this.card('Decks & Stakes', () => this.show('title'), 'wide');
    const grid = h('div', 'decks');
    DECKS.forEach((d, k) => {
      const owned = S.decks.includes(d.id);
      const el = h('button', 'deck' + (S.deck === d.id ? ' on' : '') + (owned ? '' : ' locked'));
      const cv = cardCanvas(64, 90, g => {
        rrect(g, 2, 2, 60, 86, 9); g.fillStyle = owned ? d.col : '#3a3050'; g.fill();
        rrect(g, 6, 6, 52, 78, 6); g.fillStyle = '#1a1030'; g.fill();
        emblem(g, owned ? DECK_ICON[d.id] : 'vault', 32, 45, 18, owned ? d.col : '#6a608a');
      });
      el.appendChild(cv);
      const ach = ACHIEVEMENTS.find(a => a.id === d.unlock);
      const txt = h('div', 'dtxt', `<b>${d.name}</b><span>${owned ? d.d : `Locked: ${ach ? ach.d : ''} or reach level ${k + 1}`}</span>${owned ? `<em>${STAKES.slice(0, (S.stakes[d.id] ?? 0) + 1).map(s => `<i style="background:${s.col}"></i>`).join('')}</em>` : ''}`);
      el.appendChild(txt);
      el.addEventListener('click', () => { if (!owned) { this.click('bad'); return; } this.click(); S.deck = d.id; S.stake = Math.min(S.stake, S.stakes[d.id] ?? 0); G.persist(); this.show('decks'); });
      grid.appendChild(el);
    });
    c.body.appendChild(grid);
    c.body.appendChild(h('h3', '', 'Stake'));
    const st = h('div', 'stakes');
    const maxS = S.stakes[S.deck] ?? 0;
    STAKES.forEach((s, k) => {
      const b = h('button', 'stake' + (S.stake === k ? ' on' : '') + (k > maxS ? ' locked' : ''), `<i style="background:${s.col}"></i><b>${s.n}</b><span>${k > maxS ? 'Win the stake below' : s.d}</span>`);
      b.addEventListener('click', () => { if (k > maxS) { this.click('bad'); return; } this.click(); S.stake = k; G.persist(); this.show('decks'); });
      st.appendChild(b);
    });
    c.body.appendChild(st);
    c.body.appendChild(h('p', 'note', 'Each stake adds to the ones before it. Win a run to unlock the next stake for that deck.'));
    const go = this.btn('Play this deck', 'ruby', () => G.start('run'));
    c.body.appendChild(go);
  }

  // ---------------------------------------------------------------- collection
  p_collection() {
    const G = this.G, S = G.save;
    const c = this.card(`Collection <small>${S.seen.length}/${CHARMS.length}</small>`, () => this.show('title'), 'wide');
    const info = h('div', 'cinfo', 'Charms you have seen in a shop appear here. Tap one to read it.');
    const grid = h('div', 'coll');
    [0, 1, 2, 3].forEach(r => CHARMS.filter(x => x.r === r).forEach(def => {
      const seen = S.seen.includes(def.id);
      const b = h('button', 'cc');
      if (seen) b.appendChild(charmCanvas(def.id, 52));
      else b.appendChild(cardCanvas(52, 73, g => { rrect(g, 1, 1, 50, 71, 7); g.fillStyle = '#231a3a'; g.fill(); g.strokeStyle = RARITY[def.r].h + '55'; g.lineWidth = 2; g.stroke(); g.font = "28px 'Lilita One'"; g.fillStyle = '#3d3060'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('?', 26, 38); }));
      b.addEventListener('click', () => { this.click(); info.innerHTML = seen ? `<b style="color:${RARITY[def.r].h}">${def.name}</b> · ${RARITY[def.r].n} · ${def.d}` : `<b>Undiscovered</b> · a ${RARITY[def.r].n} charm`; });
      grid.appendChild(b);
    }));
    c.body.appendChild(info); c.body.appendChild(grid);
    c.body.appendChild(h('h3', '', 'Achievements'));
    const al = h('div', 'achs');
    for (const a of ACHIEVEMENTS) {
      const d = DECKS.find(x => x.unlock === a.id);
      al.appendChild(h('div', 'ach' + (S.ach[a.id] ? ' on' : ''), `<i>${S.ach[a.id] ? '★' : '☆'}</i><b>${a.name}</b><span>${a.d}${d ? ` · unlocks ${d.name}` : ''}</span>`));
    }
    c.body.appendChild(al);
  }

  // ---------------------------------------------------------------- round cleared → cash out
  p_cash(rew) {
    const G = this.G, run = G.run;
    const wrap = h('div', 'scrim');
    const p = h('div', 'panel small cash');
    const boss = run.round.boss && bossById[run.round.boss];
    p.appendChild(h('header', '', `<h2>${boss ? boss.name + ' beaten!' : ROUND_NAMES[run.ri] + ' cleared!'}</h2>`));
    const body = h('div', 'body');
    body.appendChild(h('div', 'cashscore', `<span>Score</span><b>${fmt(run.round.score)}</b><em>target ${fmt(run.round.target)}</em>`));
    const list = h('div', 'cashlist');
    rew.lines.forEach((l, k) => {
      const row = h('div', 'cl', `<span>${l.label}</span><b>${l.amt ? '$' + l.amt : '-'}</b>`);
      row.style.animationDelay = (0.15 + k * 0.18) + 's';
      list.appendChild(row);
      setTimeout(() => { if (this.panel === 'cash' && l.amt) G.snd.play('coin'); }, 150 + k * 180);
    });
    body.appendChild(list);
    const go = this.btn(`Cash out $${rew.total}`, 'gold go', () => this.show('shop'));
    go.style.animationDelay = (0.2 + rew.lines.length * 0.18) + 's';
    body.appendChild(go);
    p.appendChild(body); wrap.appendChild(p); this.root.appendChild(wrap);
  }

  // ---------------------------------------------------------------- shop
  p_shop() {
    const G = this.G, run = G.run, s = run.shop;
    this.prev = 'shop';
    if (!s) { G.nextRound(); return; }
    const nextRi = (run.ri + 1) % 3, nextAnte = run.ri === 2 ? run.ante + 1 : run.ante;
    const nextBoss = nextRi === 2 ? bossById[E.bossFor(run, nextAnte)] : null;
    const anteBoss = bossById[E.bossFor(run, nextAnte)]; // the boss of the ante you are shopping for, shown from the Small round on
    const nextTarget = E.targetFor(run, nextAnte, nextRi);
    const tutor = !G.save.tut2 && run.ante === 1 && run.ri === 0 && run.mode !== 'zen';
    const wrap = h('div', 'scrim shopscrim');
    const p = h('div', 'shop' + (tutor ? ' tutor' : ''));
    // header
    const head = h('div', 'shophead');
    head.innerHTML = `<div><h2>Shop</h2><span>Ante ${nextAnte} · next: <b>${nextBoss ? nextBoss.name : ROUND_NAMES[nextRi]}</b> · target <b class="tg">${fmt(nextTarget)}</b><em>${nextBoss ? '' : 'Boss ahead: '}<b>${anteBoss.name}</b> · ${anteBoss.d}</em></span></div><div class="gold">$${run.gold}</div>`;
    const pz = h('button', 'iconbtn', 'II'); pz.addEventListener('click', () => { this.click(); this.show('pause'); }); head.appendChild(pz);
    p.appendChild(head);
    // owned charms
    const slots = E.charmSlots(run);
    const own = h('div', 'owned');
    own.appendChild(h('div', 'lbl', `Your charms ${run.charms.length}/${slots} <small>trigger left to right · tap one to move or sell it</small>`));
    const row = h('div', 'ownrow');
    for (let k = 0; k < slots; k++) {
      const st = run.charms[k];
      const cell = h('div', 'oslot' + (k === this.sel ? ' sel' : ''));
      if (st) {
        const b = h('button', 'ocard');
        b.appendChild(charmCanvas(st.id, 70, { glow: k === this.sel ? 1 : 0 }));
        const def = byId[st.id];
        if (def.show) b.appendChild(h('span', 'val', def.show(st)));
        b.addEventListener('click', () => { this.click(); this.sel = this.sel === k ? -1 : k; this.show('shop'); });
        cell.appendChild(b);
        if (k === this.sel) {
          const ctl = h('div', 'octl');
          ctl.appendChild(this.btn('◀', 'mini', () => { if (E.moveCharm(run, k, -1)) this.sel = k - 1; G.saveRun(); this.show('shop'); }));
          ctl.appendChild(this.btn(`Sell $${E.sellPrice(run, st.id)}`, 'mini sell', () => { E.sellCharm(run, k); this.sel = -1; G.snd.play('sell'); G.saveRun(); this.show('shop'); }));
          ctl.appendChild(this.btn('▶', 'mini', () => { if (E.moveCharm(run, k, 1)) this.sel = k + 1; G.saveRun(); this.show('shop'); }));
          cell.appendChild(ctl);
        }
      } else cell.appendChild(h('div', 'empty', ''));
      row.appendChild(cell);
    }
    own.appendChild(row);
    if (this.sel >= 0 && run.charms[this.sel]) { const d = byId[run.charms[this.sel].id]; own.appendChild(h('div', 'odesc', `<b style="color:${RARITY[d.r].h}">${d.name}</b> ${d.d}`)); }
    p.appendChild(own);
    // offers
    const offers = h('div', 'offers');
    s.charms.forEach((o, k) => {
      const def = byId[o.id], price = E.charmPrice(run, o.id);
      const el = h('button', 'offer' + (o.sold ? ' sold' : '') + (run.gold < price ? ' poor' : ''));
      el.appendChild(charmCanvas(o.id, 96));
      el.appendChild(h('div', 'otxt', `<b>${def.name}</b><i style="color:${RARITY[def.r].h}">${RARITY[def.r].n}</i><span>${fmtDesc(def.d)}</span>`));
      el.appendChild(h('div', 'price', o.sold ? 'SOLD' : `$${price}`));
      el.addEventListener('click', () => {
        if (o.sold) return;
        const r = E.buyCharm(run, k);
        if (r === 'ok') { G.snd.play('buy'); G.achievements(); if (tutor) { G.save.tut2 = 1; G.persist(); this.toast('Bought! It fires on every clear from now on', '#7ee05a'); } G.saveRun(); this.sel = -1; this.show('shop'); }
        else { G.snd.play('bad'); this.toast(r === 'gold' ? 'Not enough gold' : r === 'full' ? 'Charm slots full: sell one first' : 'Sold out', '#ff4d6d'); }
      });
      offers.appendChild(el);
    });
    p.appendChild(h('div', 'lbl', 'Charms'));
    // first shop ever: teach the charm layer right here, with the cheap Mult charm lit up
    if (tutor) p.appendChild(h('div', 'callout', '<b>Charms score on EVERY clear.</b> Buy one now (you can afford it). They fire left to right, so put x Mult charms last.'));
    p.appendChild(offers);
    const lower = h('div', 'lower');
    const gbox = h('div', 'glyphs');
    gbox.appendChild(h('div', 'lbl', `Glyphs ${run.glyphs.length}/${run.glyphSlots} <small>one-shot</small>`));
    if (tutor) gbox.appendChild(h('div', 'callout', '<b>Glyphs are one-shot tricks.</b> In play, tap one, then a piece or the board. Redeal, Bomb, Shrink and Undo can save a stuck board.'));
    const grow = h('div', 'grow');
    s.glyphs.forEach((o, k) => {
      const def = glyphById[o.id], price = E.glyphPrice(run);
      const el = h('button', 'goffer' + (o.sold ? ' sold' : '') + (run.gold < price ? ' poor' : ''));
      el.appendChild(glyphCanvas(o.id, 26));
      el.appendChild(h('div', 'otxt', `<b>${def.name}</b><span>${def.d}</span>`));
      el.appendChild(h('div', 'price', o.sold ? 'SOLD' : `$${price}`));
      el.addEventListener('click', () => {
        if (o.sold) return;
        const r = E.buyGlyph(run, k);
        if (r === 'ok') { G.snd.play('buy'); G.saveRun(); this.show('shop'); }
        else { G.snd.play('bad'); this.toast(r === 'gold' ? 'Not enough gold' : r === 'full' ? 'Glyph slots full' : 'Sold out', '#ff4d6d'); }
      });
      grow.appendChild(el);
    });
    gbox.appendChild(grow);
    if (run.glyphs.length) gbox.appendChild(h('div', 'held', 'Holding: ' + run.glyphs.map(g => glyphById[g].name).join(', ')));
    lower.appendChild(gbox);
    const ebox = h('div', 'edit');
    ebox.appendChild(h('div', 'lbl', 'Piece deck'));
    if (s.edit) {
      const e = s.edit, tx = E.editText(e);
      const el = h('button', 'eoffer' + (e.sold ? ' sold' : '') + (run.gold < e.cost ? ' poor' : ''));
      el.appendChild(cardCanvas(70, 70, g => {
        rrect(g, 1, 1, 68, 68, 10); g.fillStyle = '#1a1030'; g.fill(); g.strokeStyle = e.t === 'remove' ? '#ff4d6d' : e.t === 'gild' ? '#ffcc33' : e.t === 'foil' ? '#ff7ad9' : '#7ee05a'; g.lineWidth = 2; g.stroke();
        const cells = FAMILIES[e.f].v[0];
        const dm = E.dims(cells), cs = Math.min(14, 50 / Math.max(dm.w, dm.h));
        pieceShape(g, cells, 35, 35, cs, 4, e.t === 'gild' ? 'gold' : e.t === 'foil' ? 'foil' : 'n', 0.3, DPR());
        if (e.t === 'remove') { g.strokeStyle = '#ff4d6d'; g.lineWidth = 4; g.lineCap = 'round'; g.beginPath(); g.moveTo(14, 14); g.lineTo(56, 56); g.stroke(); }
      }));
      el.appendChild(h('div', 'otxt', `<b>${tx.title}</b><span>${tx.d}</span>`));
      el.appendChild(h('div', 'price', e.sold ? 'DONE' : `$${e.cost}`));
      el.addEventListener('click', () => {
        if (e.sold) return;
        const r = E.buyEdit(run);
        if (r === 'ok') { G.snd.play('buy'); G.saveRun(); this.show('shop'); }
        else { G.snd.play('bad'); this.toast('Not enough gold', '#ff4d6d'); }
      });
      ebox.appendChild(el);
    }
    const fams = Object.entries(run.deck).filter(([, v]) => v.w > 0).map(([f, v]) => `<i class="${v.foil ? 'foil' : v.gold ? 'gild' : ''}">${FAMILIES[f].name}</i>`).join('');
    ebox.appendChild(h('div', 'fams', fams));
    lower.appendChild(ebox);
    p.appendChild(lower);
    // footer
    const foot = h('div', 'shopfoot');
    const rp = E.rerollPrice(run);
    const rb = this.btn('Reroll', 'sapphire reroll', () => { if (E.reroll(run)) { G.snd.play('reroll'); G.saveRun(); this.show('shop'); } else { G.snd.play('bad'); this.toast('Not enough gold', '#ff4d6d'); } }, rp ? `$${rp}` : 'free');
    if (run.gold < rp) rb.classList.add('poor');
    foot.appendChild(rb);
    foot.appendChild(this.btn('Next round ▶', 'ruby go', () => { this.sel = -1; if (tutor) { G.save.tut2 = 1; G.persist(); } G.nextRound(); }, nextBoss ? nextBoss.name : ROUND_NAMES[nextRi]));
    p.appendChild(foot);
    wrap.appendChild(p);
    this.root.appendChild(wrap);
  }

  // ---------------------------------------------------------------- run over
  p_over(o) {
    const G = this.G, run = G.run, S = G.save, zen = run.mode === 'zen';
    const wrap = h('div', 'scrim');
    const p = h('div', 'panel over' + (o.victory ? ' win' : ''));
    const title = o.victory ? 'Royal Victory!' : zen ? 'Board full' : 'Run over';
    p.appendChild(h('header', '', `<h2>${title}</h2>`));
    const body = h('div', 'body');
    if (zen) {
      body.appendChild(h('div', 'bigstat', `<span>Score</span><b>${fmt(run.round.score)}</b><em>${run.round.score >= S.best.zen ? 'New best!' : 'best ' + fmt(S.best.zen)}</em>`));
    } else {
      const r = run.round;
      body.appendChild(h('div', 'bigstat', `<span>${o.victory ? 'All 8 antes beaten' : 'Reached'}</span><b>Ante ${Math.min(run.ante, ANTES)}</b><em>${o.victory ? deckById[run.deckId].name + ' · ' + STAKES[run.stake].n + ' Stake' : `${r.boss ? bossById[r.boss].name : ROUND_NAMES[run.ri]}: ${fmt(r.score)} / ${fmt(r.target)}`}</em>`));
      // ante track
      let track = '';
      for (let a = 1; a <= ANTES; a++) track += `<i class="${a < run.ante || o.victory ? 'done' : a === run.ante ? 'here' : ''}">${a}</i>`;
      body.appendChild(h('div', 'track', track));
    }
    const st = run.stats;
    body.appendChild(h('div', 'stats', `
      <div><span>Best hand</span><b class="m">${fmt(st.bestHand)}</b></div>
      <div><span>Lines</span><b>${st.lines}</b></div>
      <div><span>Best streak</span><b>${st.maxStreak}</b></div>
      <div><span>${zen ? 'Placed' : 'Rounds won'}</span><b>${zen ? st.placed : st.rounds}</b></div>`));
    if (!zen && run.charms.length) {
      const cr = h('div', 'ocharms');
      run.charms.forEach(s => cr.appendChild(charmCanvas(s.id, 40)));
      body.appendChild(cr);
    }
    const need = S.level * XP_PER_LEVEL;
    body.appendChild(h('div', 'level', `<b>+${o.xp} XP${o.levelUp ? ' · LEVEL UP!' : ''}</b><div class="bar"><i style="width:${Math.min(100, S.xp / need * 100)}%"></i></div><span>Level ${S.level} · ${S.xp}/${need}</span>`));
    if (o.unlocked.length) body.appendChild(h('div', 'unl', '🔓 Unlocked: ' + o.unlocked.join(', ')));
    if (o.share) {
      const sh = h('div', 'share');
      sh.appendChild(h('pre', '', o.share));
      const sb = h('div', 'row2');
      sb.appendChild(this.btn('Copy result', 'small', () => { try { navigator.clipboard.writeText(o.share); this.toast('Copied!', '#7ee05a'); } catch (e) { this.toast('Copy failed', '#ff4d6d'); } }));
      if (run.mode === 'run') sb.appendChild(this.btn('Replay seed', 'small', () => G.start('run', { seed: run.seed })));
      sh.appendChild(sb);
      body.appendChild(sh);
    }
    const btns = h('div', 'btns');
    btns.appendChild(this.btn('Menu', 'small', () => this.show('title')));
    btns.appendChild(this.btn(zen ? 'Again' : run.mode === 'daily' ? 'Retry daily' : 'New run', 'ruby', () => G.start(run.mode), 'R'));
    body.appendChild(btns);
    p.appendChild(body); wrap.appendChild(p); this.root.appendChild(wrap);
  }
}
function todayKey() { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; }
function fmtDesc(d) {
  return d.replace(/([+x][\d.]+ Mult|x[\d.]+ Mult|Mult)/g, '<em class="m">$1</em>').replace(/(\+\d+ Chips|Chips)/g, '<em class="c">$1</em>').replace(/(\$\d+)/g, '<em class="g">$1</em>');
}
