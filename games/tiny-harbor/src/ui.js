// Everything drawn in HTML on top of the 3D view: HUD, prompts, toasts,
// world labels, the reel meter and every menu/panel.
import * as THREE from 'three';
import { FISH, FISH_BY_ID } from './fishing.js';
import { PAINTS, STAGES, EXTRAS } from './cabin.js';
import { BOAT_TYPES, BASE_PRICE } from './boats.js';
import { fmtTime } from './util.js';
import { FURNITURE, FLOORS } from './interior.js';
import { ISLANDS } from './terrain.js';
import { ISLE_TRADERS } from './islands.js';

const INK = '#3b2f2a';
export const ICON = {
  wood: `<svg class="ic" viewBox="0 0 24 24"><rect x="2" y="7" width="17" height="10" rx="5" fill="#a8693c" stroke="${INK}" stroke-width="2"/><ellipse cx="18.5" cy="12" rx="3.5" ry="5" fill="#ecc38a" stroke="${INK}" stroke-width="2"/><circle cx="18.5" cy="12" r="1.4" fill="#c49058"/></svg>`,
  coin: `<svg class="ic" viewBox="0 0 24 24"><circle cx="12" cy="12" r="9" fill="#f4b740" stroke="${INK}" stroke-width="2"/><circle cx="12" cy="12" r="5" fill="none" stroke="#c98f1f" stroke-width="2"/></svg>`,
  fish: `<svg class="ic" viewBox="0 0 24 24"><path d="M2 12 Q8 4 15 8 L21 4 L20 12 L21 20 L15 16 Q8 20 2 12Z" fill="#7fb4d0" stroke="${INK}" stroke-width="2" stroke-linejoin="round"/><circle cx="7" cy="11" r="1.3" fill="${INK}"/></svg>`,
  cooked: `<svg class="ic" viewBox="0 0 24 24"><path d="M2 14 Q8 6 15 10 L21 6 L20 14 L21 22 L15 18 Q8 22 2 14Z" fill="#d98a4a" stroke="${INK}" stroke-width="2" stroke-linejoin="round"/><path d="M8 6 q-2 -2 0 -4 M12 6 q-2 -2 0 -4" stroke="${INK}" stroke-width="1.6" fill="none" stroke-linecap="round"/></svg>`,
  clam: `<svg class="ic" viewBox="0 0 24 24"><path d="M3 15 Q12 0 21 15 Q12 20 3 15Z" fill="#e8a7a0" stroke="${INK}" stroke-width="2" stroke-linejoin="round"/><path d="M12 6 V16 M8 9 L10 16 M16 9 L14 16" stroke="${INK}" stroke-width="1.3"/></svg>`,
  shell: `<svg class="ic" viewBox="0 0 24 24"><path d="M4 18 L12 3 L20 18 Q12 22 4 18Z" fill="#fbe3c6" stroke="${INK}" stroke-width="2" stroke-linejoin="round"/><path d="M8 17 L12 7 L16 17" stroke="#e0a080" stroke-width="1.5" fill="none"/></svg>`,
  belly: `<svg class="ic" viewBox="0 0 24 24"><path d="M5 9 h14 a7 7 0 0 1 -14 0z" fill="#ffcf8a" stroke="${INK}" stroke-width="2" stroke-linejoin="round"/><path d="M9 6 q-1.5 -2 0 -4 M13 6 q-1.5 -2 0 -4" stroke="${INK}" stroke-width="1.6" fill="none" stroke-linecap="round"/><rect x="4" y="19" width="16" height="2.5" rx="1.2" fill="${INK}"/></svg>`,
  sun: `<svg class="ic" viewBox="0 0 24 24"><circle cx="12" cy="12" r="5" fill="#ffd75e" stroke="${INK}" stroke-width="2"/><g stroke="${INK}" stroke-width="2" stroke-linecap="round"><path d="M12 1.5v3M12 19.5v3M1.5 12h3M19.5 12h3M4.5 4.5l2 2M17.5 17.5l2 2M4.5 19.5l2-2M17.5 6.5l2-2"/></g></svg>`,
  moon: `<svg class="ic" viewBox="0 0 24 24"><path d="M15 3 A9 9 0 1 0 21 15 A7 7 0 0 1 15 3Z" fill="#fdf0b8" stroke="${INK}" stroke-width="2" stroke-linejoin="round"/></svg>`,
  wave: `<svg class="ic" viewBox="0 0 24 24"><path d="M2 14 q3 -4 6 0 t6 0 t6 0 v7 h-18z" fill="#62d9cb" stroke="${INK}" stroke-width="2" stroke-linejoin="round"/></svg>`,
  boat: `<svg class="ic" viewBox="0 0 24 24"><path d="M3 15 h18 l-3 5 h-12z" fill="#e0523f" stroke="${INK}" stroke-width="2" stroke-linejoin="round"/><path d="M12 3 v12 M12 4 l6 9 h-6" fill="#fbf3e2" stroke="${INK}" stroke-width="2" stroke-linejoin="round"/></svg>`,
  house: `<svg class="ic" viewBox="0 0 24 24"><path d="M3 11 L12 3 L21 11 V21 H3Z" fill="#c4563f" stroke="${INK}" stroke-width="2" stroke-linejoin="round"/><rect x="9.5" y="14" width="5" height="7" fill="#fff8ec" stroke="${INK}" stroke-width="1.5"/></svg>`,
  star: `<svg class="ic" viewBox="0 0 24 24"><path d="M12 2 l3 6.5 7 .8 -5.2 4.8 1.4 7 -6.2 -3.6 -6.2 3.6 1.4 -7 -5.2 -4.8 7 -.8z" fill="#ffd75e" stroke="${INK}" stroke-width="2" stroke-linejoin="round"/></svg>`,
};
export function fishSvg(f, w = 64) {
  if (f.id === 'octopus') {
    return `<svg viewBox="0 0 64 40" width="${w}"><path d="M20 22 Q20 4 32 4 Q44 4 44 22 L48 34 L42 28 L38 36 L33 28 L28 36 L25 28 L18 34Z" fill="${f.color}" stroke="${INK}" stroke-width="3" stroke-linejoin="round"/><circle cx="27" cy="16" r="2.6" fill="${INK}"/><circle cx="37" cy="16" r="2.6" fill="${INK}"/></svg>`;
  }
  const glow = f.legendary ? `<circle cx="10" cy="8" r="3" fill="#fff6c0" stroke="${INK}" stroke-width="2"/><path d="M14 13 Q12 8 10 8" stroke="${INK}" stroke-width="2" fill="none"/>` : '';
  const flat = f.id === 'flounder' ? 'Q22 10 42 15 L56 6 L53 20 L56 34 L42 25 Q22 30 6 20Z' : 'Q22 4 42 12 L56 4 L52 20 L56 36 L42 28 Q22 36 6 20Z';
  return `<svg viewBox="0 0 64 40" width="${w}"><path d="M6 20 ${flat}" fill="${f.color}" stroke="${INK}" stroke-width="3" stroke-linejoin="round"/><path d="M28 12 Q31 20 28 28" stroke="${INK}" stroke-width="2" fill="none" opacity=".5"/><circle cx="15" cy="18" r="2.6" fill="${INK}"/>${glow}</svg>`;
}

const h = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; };

export class UI {
  constructor(game) {
    this.g = game;
    this.root = document.getElementById('ui');
    this.panel = null;
    this.labels = new Map();
    this.cache = {};
    this.build();
  }

  build() {
    const r = this.root;
    this.hudEls = h('div', 'hudwrap');
    this.hudEls.style.cssText = 'position:absolute;inset:0;pointer-events:none';
    r.appendChild(this.hudEls);
    const H = this.hudEls;
    this.goal = h('div', 'hud card hud-goal', `<div class="flag">!</div><div><small>Next goal</small><b></b></div>`);
    this.time = h('div', 'hud card hud-time', `<div class="row"><span class="ti"></span><span class="clock"></span><span class="day"></span></div><div class="tide">${ICON.wave}<div class="bar"><i></i></div><span class="arrow"></span><span class="tt"></span></div><div class="wx"><span class="wi"></span><span class="wn"></span><span class="wa">➤</span></div>`);
    this.inv = h('div', 'hud card hud-inv', `<div class="belly">${ICON.belly}<div class="bar"><i></i></div></div><div class="res"></div>`);
    this.promptEl = h('div', 'hud card prompt', '');
    this.toastsEl = h('div', 'hud toasts', '');
    this.bannerEl = h('div', 'hud card banner', '');
    this.hint = h('div', 'hud card hint', `<b>WASD</b> walk · <b>E</b> use · <b>Q</b> enter home · <b>F</b> eat · <b>J</b> journal · <b>Esc</b> menu`);
    this.vig = h('div', 'hud vignette', '');
    this.reelEl = h('div', 'hud card reel', `<div class="meter"><div class="track"><div class="zone"></div><div class="fish"></div></div><div class="prog"><i></i></div></div><small>Hold <b>E</b> /<br>tap & hold</small>`);
    this.labelLayer = h('div', 'hud', ''); this.labelLayer.style.inset = '0';
    this.mini = h('canvas', 'hud card mini');
    this.mini.width = this.mini.height = 150;
    H.appendChild(this.mini);
    for (const e of [this.labelLayer, this.vig, this.goal, this.time, this.inv, this.promptEl, this.toastsEl, this.bannerEl, this.hint, this.reelEl]) H.appendChild(e);

    // touch controls
    this.touch = h('div', 'touch', `<div class="joy"><i></i></div><div class="tbtn act">USE</div><div class="tbtn eat">${ICON.belly}</div><div class="tbtn menu">II</div><div class="tbtn jr">${ICON.star}</div><div class="tbtn alt"></div><div class="tbtn furn">🛠</div>`);
    this.touch.style.cssText = 'position:absolute;inset:0;pointer-events:none';
    for (const c of this.touch.children) c.style.pointerEvents = 'auto';
    r.appendChild(this.touch);
    this.showHud(false);
  }

  miniOn(on) {
    if (this.cache.mini === on) return;
    this.cache.mini = on;
    this.mini.style.display = on ? 'block' : 'none';
  }

  showHud(on) {
    this.hudEls.style.display = on ? '' : 'none';
    this.touch.style.display = on ? '' : 'none';
  }

  // ------------------------------------------------------------- HUD
  hud(S, info) {
    const set = (k, v, fn) => { if (this.cache[k] !== v) { this.cache[k] = v; fn(v); } };
    set('goal', info.goal, (v) => { this.goal.querySelector('b').textContent = v || 'All goals done. Enjoy the island!'; });
    set('clock', info.clock, (v) => { this.time.querySelector('.clock').textContent = v; });
    set('day', 'Day ' + info.day, (v) => { this.time.querySelector('.day').textContent = v; });
    set('ti', info.night, (v) => { this.time.querySelector('.ti').innerHTML = v ? ICON.moon : ICON.sun; });
    set('tideW', Math.round(info.tide * 100), (v) => { this.time.querySelector('.tide i').style.width = v + '%'; });
    set('tideA', info.rising, (v) => { this.time.querySelector('.arrow').textContent = v ? '▲' : '▼'; });
    set('tideT', info.tideText, (v) => { this.time.querySelector('.tt').textContent = v; });
    if (info.wx) {
      set('wxi', info.wx.state, (v) => { this.time.querySelector('.wi').innerHTML = info.wx.icon; this.time.querySelector('.wx').classList.toggle('bad', v === 'storm'); });
      set('wxn', info.wx.label, (v) => { this.time.querySelector('.wn').textContent = v; });
      set('wxa', Math.round(info.wx.arrow / 5) * 5, (v) => { this.time.querySelector('.wa').style.transform = `rotate(${v}deg)`; });
    }
    set('belly', Math.round(S.belly), (v) => {
      this.inv.querySelector('.belly .bar i').style.width = v + '%';
      this.inv.querySelector('.belly').classList.toggle('low', v < 20);
      this.vig.style.opacity = v <= 0 ? 1 : 0;
    });
    const fishN = Object.values(S.fish).reduce((a, b) => a + b, 0);
    const res = [['wood', S.wood], ['coin', S.coins], ['fish', fishN], ['cooked', S.cooked], ['clam', S.clams], ['shell', S.shells]];
    const key = res.map((x) => x[1]).join(',');
    if (this.cache.res !== key) {
      const old = (this.cache.res || '').split(',');
      this.cache.res = key;
      const el = this.inv.querySelector('.res');
      el.innerHTML = res.filter(([k, v], i) => i < 2 || v > 0).map(([k, v]) => `<span data-k="${k}">${ICON[k]}${v}</span>`).join('');
      res.forEach(([k, v], i) => { if (old[i] !== undefined && +old[i] < v) el.querySelector(`[data-k="${k}"]`)?.classList.add('bump'); });
    }
  }

  prompt(text, key = 'E', alt = null) {
    const v = text ? key + '|' + text + '|' + (alt ? alt.key + alt.text : '') : '';
    if (this.cache.prompt === v) return;
    this.cache.prompt = v;
    this.promptEl.classList.toggle('on', !!text);
    if (text) this.promptEl.innerHTML = `<span class="key">${key}</span>${text}${alt ? `<span class="sep"></span><span class="key">${alt.key}</span>${alt.text}` : ''}`;
    const altBtn = this.touch.querySelector('.alt');
    altBtn.style.display = alt ? 'grid' : 'none';
    if (alt) altBtn.textContent = alt.text;
    const act = this.touch.querySelector('.act');
    act.textContent = text ? text.replace(/\s*\(.*\)/, '').split(' ').slice(0, 2).join(' ') : 'USE';
  }

  toast(html, life = 2.4) {
    const t = h('div', 'card toast', html);
    t.style.setProperty('--life', life + 's');
    this.toastsEl.appendChild(t);
    while (this.toastsEl.children.length > 4) this.toastsEl.firstChild.remove();
    setTimeout(() => t.remove(), life * 1000 + 450);
  }

  banner(text) {
    if (this.cache.banner === text) return;
    this.cache.banner = text;
    this.bannerEl.classList.toggle('on', !!text);
    if (text) this.bannerEl.innerHTML = text;
  }

  // ------------------------------------------------------- world labels
  beginLabels() { for (const l of this.labels.values()) l.used = false; }
  label(id, pos, text, cls, camera, w, hgt) {
    let l = this.labels.get(id);
    if (!l) { l = { el: h('div', 'wlabel') }; this.labelLayer.appendChild(l.el); this.labels.set(id, l); }
    l.used = true;
    const v = pos.clone().project(camera);
    if (v.z > 1 || Math.abs(v.x) > 1.1 || Math.abs(v.y) > 1.1) { l.el.style.display = 'none'; return; }
    l.el.style.display = 'block';
    l.el.style.left = ((v.x + 1) / 2) * w + 'px';
    l.el.style.top = ((1 - v.y) / 2) * hgt + 'px';
    if (l.text !== text) { l.text = text; l.el.innerHTML = text; }
    const c = 'wlabel ' + (cls || '');
    if (l.el.className !== c) l.el.className = c;
  }
  endLabels() { for (const l of this.labels.values()) if (!l.used) l.el.style.display = 'none'; }

  // ------------------------------------------------------------- reel
  reel(f) {
    this.reelEl.classList.toggle('on', !!f);
    if (!f) return;
    const zone = this.reelEl.querySelector('.zone');
    zone.style.bottom = f.zone * 100 + '%';
    zone.style.height = f.zoneH * 100 + '%';
    zone.classList.toggle('in', !!f.inside);
    const fish = this.reelEl.querySelector('.fish');
    if (fish.dataset.id !== f.fish.id) { fish.dataset.id = f.fish.id; fish.innerHTML = fishSvg(f.fish, 30); }
    fish.style.bottom = f.fishY * 100 + '%';
    this.reelEl.querySelector('.prog i').style.height = Math.max(0, f.progress) * 100 + '%';
  }

  // ------------------------------------------------------------- panels
  get open() { return !!this.panel; }
  close() {
    if (this.panel) { this.panel.el.remove(); this.panel = null; }
  }
  show(kind, data = {}) {
    this.close();
    const scrim = h('div', 'scrim');
    scrim.addEventListener('pointerdown', (e) => { if (e.target === scrim && kind !== 'title' && kind !== 'confirm') this.g.act('close'); });
    scrim.addEventListener('click', (e) => {
      const b = e.target.closest('[data-act]');
      if (!b || b.disabled) return;
      this.g.audio.play('click');
      this.g.act(b.dataset.act, b.dataset.arg);
    });
    scrim.addEventListener('input', (e) => { if (e.target.dataset.set) this.g.act('set', [e.target.dataset.set, +e.target.value]); });
    if (kind === 'title') scrim.style.background = 'none';
    this.root.appendChild(scrim);
    this.panel = { el: scrim, kind, data, tab: data.tab };
    this.render();
  }
  setTab(t) { if (this.panel) { this.panel.tab = t; this.render(); } }
  render() {
    if (!this.panel) return;
    const { kind } = this.panel;
    const fn = this['p_' + kind];
    const scroll = this.panel.el.querySelector('.body')?.scrollTop || 0;
    this.panel.el.innerHTML = fn.call(this, this.panel);
    const body = this.panel.el.querySelector('.body');
    if (body) body.scrollTop = scroll;
  }
  frame(title, sub, icon, body, tabs, extraHead = '') {
    const t = tabs ? `<div class="tabs">${tabs.map(([id, label]) => `<button class="btn small tab ${this.panel.tab === id ? 'sel' : ''}" data-act="tab" data-arg="${id}">${label}</button>`).join('')}</div>` : '';
    return `<div class="panel"><header>${icon || ''}<div><h2>${title}</h2>${sub ? `<p>${sub}</p>` : ''}</div><div style="flex:1"></div>${extraHead}<button class="btn icon x" data-act="close" aria-label="Close">✕</button></header>${t}<div class="body">${body}</div></div>`;
  }
  coinsChip() { return `<span class="chip">${ICON.coin}${this.g.S.coins}</span>`; }

  p_trade(p) {
    const S = this.g.S, T = p.data.trader, b = T.boat;
    p.tab = p.tab || 'sell';
    const mult = (k) => (T.likes === k || (T.likes === 'shells' && k === 'clams') ? T.bonus : 1);
    let body = `<div class="speech"><b>${T.who}:</b> ${T.hello}</div>`;
    if (p.tab === 'sell') {
      const rows = [];
      const add = (key, icon, name, have, price, note) => {
        if (have <= 0) return;
        rows.push(`<div class="row-item">${icon}<div class="t"><b>${name} <span class="chip">×${have}</span></b><small>${note || ''}</small></div><span class="price">${ICON.coin}${price}</span><button class="btn small" data-act="sell" data-arg="${key}:1">Sell 1</button><button class="btn small warm" data-act="sell" data-arg="${key}:all">All</button></div>`);
      };
      for (const f of FISH) add('fish.' + f.id, fishSvg(f, 34), f.name, S.fish[f.id] || 0, Math.round(f.price * mult('fish')), mult('fish') > 1 ? `${T.who} pays extra for fish` : '');
      add('clams', ICON.clam, 'Clams', S.clams, Math.round(BASE_PRICE.clams * mult('clams')), mult('clams') > 1 ? `${T.who} pays extra for these` : 'Or eat them, +10 belly');
      add('shells', ICON.shell, 'Shells', S.shells, Math.round(BASE_PRICE.shells * mult('shells')), mult('shells') > 1 ? `${T.who} pays extra for these` : 'Also used for the shell path and furniture');
      add('wood', ICON.wood, 'Wood', S.wood, Math.round(BASE_PRICE.wood * mult('wood')), mult('wood') > 1 ? `${T.who} pays extra for wood` : 'You need wood to build!');
      body += rows.length ? `<div class="rows">${rows.join('')}</div>` : `<p style="color:var(--muted);font-weight:500">Nothing to sell yet. Catch fish, dig clams at low tide, or chop wood.</p>`;
    } else {
      const goods = T.goods();
      body += goods.length ? `<div class="rows">${goods.map((x) => `<div class="row-item">${x.icon || ''}<div class="t"><b>${x.name}</b><small>${x.desc}</small></div><span class="price">${ICON.coin}${x.price}</span><button class="btn small primary" data-act="buy" data-arg="${x.id}" ${S.coins < x.price ? 'disabled' : ''}>Buy</button></div>`).join('')}</div>` : `<p style="color:var(--muted);font-weight:500">You've bought everything ${T.who} sells. Thank you kindly!</p>`;
    }
    const left = b ? `<span class="chip" title="Time before they sail">⏱ ${fmtTime(b.timer)}</span>` : '';
    return this.frame(T.title, T.sub, ICON.boat, body, [['sell', 'Sell'], ['buy', 'Buy']], `<div style="display:flex;gap:6px">${left}${this.coinsChip()}</div>`);
  }

  p_cabin(p) {
    const S = this.g.S;
    p.tab = p.tab || 'build';
    let body = '';
    const dots = `<div class="stage-dots">${STAGES.map((_, i) => `<i class="${i <= S.stage ? 'on' : ''}"></i>`).join('')}</div>`;
    if (p.tab === 'build') {
      const cur = STAGES[S.stage], next = STAGES[S.stage + 1];
      body += `<div class="stage-card"><div class="num">${S.stage + 1}</div><div class="t"><b style="font-size:18px">${cur.name}</b><br><small style="color:var(--muted)">${cur.blurb}</small></div></div>${dots}`;
      if (next) {
        const ok = S.wood >= next.wood && S.coins >= next.coins;
        body += `<h3>Next: ${next.name}</h3><div class="stage-card"><div class="num" style="background:var(--paper2)">${S.stage + 2}</div><div class="t" style="flex:1"><b style="font-size:18px">${next.name}</b><br><small style="color:var(--muted)">${next.blurb}</small><div style="margin-top:6px;display:flex;gap:6px"><span class="chip">${ICON.wood}${S.wood}/${next.wood}</span>${next.coins ? `<span class="chip">${ICON.coin}${S.coins}/${next.coins}</span>` : ''}</div></div><button class="btn primary" data-act="upgrade" ${ok ? '' : 'disabled'}>Build</button></div>`;
      } else body += `<p style="font-weight:600">Your cottage is finished. It's the cosiest house on the coast.</p>`;
      if (!S.bridge) body += `<h3>Around the island</h3><div class="row-item">${ICON.wood}<div class="t"><b>Lighthouse Bridge</b><small>Build it at the sign by the sandbar, so high tide can't cut you off.</small></div><span class="chip">${ICON.wood}20</span></div>`;
    } else if (p.tab === 'paint') {
      if (S.stage < 1) body += `<p style="font-weight:600">Build the shack first, then you can paint it.</p>`;
      else {
        for (const [part, label] of [['walls', 'Walls'], ['roof', 'Roof'], ['door', 'Door'], ['trim', 'Trim & fence']]) {
          body += `<h3>${label}</h3><div class="swatches">${Object.entries(PAINTS).map(([id, c]) => {
            const owned = c.free || S.paints[id];
            return `<button class="sw ${S.paint[part] === id ? 'sel' : ''} ${owned ? '' : 'locked'}" style="background:${c.hex}" title="${c.name}${owned ? '' : c.isle ? ' (sold on ' + c.isle + ')' : ' (sold by Marigold)'}" ${owned ? `data-act="paint" data-arg="${part}:${id}"` : ''}></button>`;
          }).join('')}</div>`;
        }
        body += `<p style="font-size:13px;color:var(--muted);font-weight:500;margin-top:12px">Locked colours are sold by Auntie Pim on the Marigold, and three rare ones by Miss Opal on Coral Cove.</p>`;
      }
    } else {
      body += `<div class="grid2">${Object.entries(EXTRAS).map(([id, x]) => {
        const owned = S.owned[id];
        let action;
        if (S.stage < x.min) action = `<button class="btn small" disabled>Needs ${STAGES[x.min].name}</button>`;
        else if (owned) action = `<button class="btn small ${S.shown[id] ? '' : 'primary'}" data-act="toggle" data-arg="${id}">${S.shown[id] ? 'Put away' : 'Place it'}</button>`;
        else if (x.shop) action = `<button class="btn small" disabled>${ICON.coin}${x.shop} at Marigold</button>`;
        else {
          const [res, n] = Object.entries(x.cost)[0];
          action = `<button class="btn small primary" data-act="make" data-arg="${id}" ${S[res] >= n ? '' : 'disabled'}>Make ${ICON[res === 'shells' ? 'shell' : res]}${n}</button>`;
        }
        return `<div class="ex"><b>${x.name}</b><small>${x.blurb}</small>${action}</div>`;
      }).join('')}</div>`;
    }
    const sleep = this.g.isNight() ? `<button class="btn warm" data-act="sleep" >${ICON.moon} Sleep</button>` : '';
    return this.frame('Your Home', `${STAGES[S.stage].name} · ${S.wood} wood`, ICON.house, body, [['build', 'Build'], ['paint', 'Paint'], ['extras', 'Extras']], sleep);
  }

  p_journal(p) {
    const S = this.g.S;
    p.tab = p.tab || 'goals';
    let body = '';
    if (p.tab === 'goals') {
      body = this.g.goals.map((gl) => `<div class="goal-row ${S.goals[gl.id] ? 'done' : ''}"><div class="tick">${S.goals[gl.id] ? '✓' : ''}</div><span>${gl.text}</span><span class="rw">${ICON.coin}${gl.reward}</span></div>`).join('');
    } else if (p.tab === 'fish') {
      const n = FISH.filter((f) => S.caught[f.id]).length;
      body = `<p style="margin:0 0 10px;font-weight:600">${n} of ${FISH.length} found</p><div class="fishgrid">${FISH.map((f) => S.caught[f.id]
        ? `<div class="fishcard">${fishSvg(f)}<b>${f.name}</b><small>Caught ${S.caught[f.id]} · ${f.price}c</small><small>${f.where}</small></div>`
        : `<div class="fishcard unk">${fishSvg(f)}<b>???</b><small>${f.where}</small></div>`).join('')}</div>`;
    } else {
      const st = S.stats;
      const rows = [['Days on the island', Math.floor(S.clock / this.g.DAY) + 1], ['Trees chopped', st.trees], ['Fish caught', st.fish], ['Meals cooked', st.cooked], ['Clams dug', st.clams], ['Boats served', st.boats], ['Boats guided by the lamp', st.guided], ['Coins earned', st.earned]];
      body = `<div class="rows">${rows.map(([a, b]) => `<div class="row-item"><div class="t"><b>${a}</b></div><span class="price">${b}</span></div>`).join('')}</div>`;
    }
    return this.frame('Journal', 'Goals, fish and memories', ICON.star, body, [['goals', 'Goals'], ['fish', 'Fish Book'], ['stats', 'Stats']]);
  }

  p_furnish(p) {
    const S = this.g.S;
    p.tab = p.tab || 'make';
    let body = '';
    const costChips = (cost) => Object.entries(cost).map(([k, n]) => {
      const have = k === 'fish' ? Object.values(S.fish).reduce((a, b) => a + b, 0) : S[k];
      const icon = { wood: ICON.wood, shells: ICON.shell, coins: ICON.coin, fish: ICON.fish }[k];
      return `<span class="chip" style="${have < n ? 'color:var(--coral-d)' : ''}">${icon}${n}</span>`;
    }).join('');
    if (p.tab === 'make') {
      const placed = {};
      for (const it of S.room) placed[it.id] = (placed[it.id] || 0) + 1;
      body = `<div class="grid2">${Object.entries(FURNITURE).map(([id, F]) => {
        const stored = S.furn[id] || 0;
        const ok = F.cost && this.g.canAfford(F.cost);
        return `<div class="ex"><b>${F.name}</b><small>${F.blurb}${placed[id] ? ` · ${placed[id]} in the room` : ''}</small>
          <div style="display:flex;gap:4px;flex-wrap:wrap">${F.cost ? costChips(F.cost) : ''}</div>
          <div style="display:flex;gap:6px">${F.shop ? `<button class="btn small" disabled>Sold on ${F.shop}</button>` : `<button class="btn small primary" data-act="craft" data-arg="${id}" ${ok ? '' : 'disabled'}>Make</button>`}
          ${stored ? `<button class="btn small warm" data-act="placeItem" data-arg="${id}">Place (${stored})</button>` : ''}</div></div>`;
      }).join('')}</div>`;
    } else {
      body = `<h3>Wallpaper</h3><div class="swatches">${Object.entries(PAINTS).filter(([id, c]) => c.free || S.paints[id]).map(([id, c]) =>
        `<button class="sw ${S.wallpaper === id ? 'sel' : ''}" style="background:${c.hex}" title="${c.name}" data-act="wallpaper" data-arg="${id}"></button>`).join('')}</div>
        <p style="font-size:13px;color:var(--muted);font-weight:500">More colours come from paint you buy on the Marigold.</p>
        <h3>Floor</h3><div style="display:flex;gap:8px;flex-wrap:wrap">${Object.entries(FLOORS).map(([id, f]) =>
        `<button class="btn small ${S.floor === id ? 'sel' : ''}" data-act="floor" data-arg="${id}"><span style="width:16px;height:16px;border-radius:4px;background:linear-gradient(90deg,${f.a} 50%,${f.b} 50%);border:2px solid var(--ink)"></span>${f.name}</button>`).join('')}</div>`;
    }
    const n = Object.values(S.furn).reduce((a, b) => a + b, 0);
    return this.frame('Furniture', `Make it, then place it · ${n} waiting to be placed`, ICON.house, body, [['make', 'Make'], ['room', 'Walls & floor']], `<div style="display:flex;gap:6px"><span class="chip">${ICON.wood}${S.wood}</span><span class="chip">${ICON.shell}${S.shells}</span>${this.coinsChip()}</div>`);
  }

  p_chart() {
    const S = this.g.S;
    const rows = ISLANDS.map((I) => {
      const T = ISLE_TRADERS[I.id];
      const sells = T.goods.map((g) => g.name).join(', ');
      const pays = { fish: 'fish', wood: 'wood', shells: 'shells and clams' }[T.likes];
      const been = S.visited && S.visited[I.id];
      return `<div class="row-item">${ICON.boat}<div class="t"><b>${I.name} <span class="chip">${T.kind}</span>${been ? ' <span class="chip" style="background:var(--teal);color:#fff">visited</span>' : ''}</b><small>${T.who} pays ${T.bonus}x for ${pays}. Sells: ${sells}.</small></div><span class="chip">${Math.round(Math.hypot(I.x, I.z))} m</span></div>`;
    }).join('');
    const boat = S.boat ? '<p style="font-weight:600;margin:0 0 10px">Your sailboat is tied up at the dock. Walk to the end of the pier and press E to set sail.</p>'
      : `<p style="font-weight:600;margin:0 0 10px">You'll need a sailboat. Build one at the boatyard sign by the dock: ${ICON.wood}40 and ${ICON.coin}30.</p>`;
    return this.frame('Sea Chart', 'The neighbouring islands', ICON.boat, boat + `<div class="rows">${rows}</div>`);
  }

  p_pause() {
    const body = `<div class="menu" style="margin:0 auto">
      <button class="btn primary" data-act="close">Resume</button>
      <button class="btn" data-act="journal">Journal</button>
      <button class="btn" data-act="howto">How to play</button>
      <button class="btn" data-act="settings">Settings</button>
      ${this.g.S.boat && (this.g.mode === 'sail' || this.g.mode === 'explore') ? '<button class="btn warm" data-act="boathome">Bring the boat home</button>' : ''}
      <button class="btn" data-act="quit">Save &amp; quit to title</button></div>`;
    return this.frame('Paused', 'The tide waits for you. (It doesn\'t, but the game is paused.)', '', body);
  }

  p_settings() {
    const a = this.g.audio, q = this.g.settings;
    const body = `<div class="settings-row"><label>Music</label><input type="range" min="0" max="100" value="${Math.round(a.music * 100)}" data-set="music"></div>
      <div class="settings-row"><label>Sound effects</label><input type="range" min="0" max="100" value="${Math.round(a.sfx * 100)}" data-set="sfx"></div>
      <div class="settings-row"><label>Graphics</label><button class="btn small ${q.quality === 'high' ? 'sel' : ''}" data-act="quality" data-arg="high">Pretty</button><button class="btn small ${q.quality === 'low' ? 'sel' : ''}" data-act="quality" data-arg="low">Fast</button></div>
      <div class="settings-row"><label>Camera distance</label><input type="range" min="70" max="140" value="${Math.round(q.zoom * 100)}" data-set="zoom"></div>
      <div style="margin-top:12px"><button class="btn" data-act="back">Back</button></div>`;
    return this.frame('Settings', '', '', body);
  }

  p_howto() {
    const body = `<div class="rows" style="font-weight:500;line-height:1.45">
      <div class="row-item">${ICON.wood}<div class="t"><b>Chop trees for wood</b><small>Walk up to a tree and press E. Trees grow back. Wood builds your home, the bridge and extras.</small></div></div>
      <div class="row-item">${ICON.fish}<div class="t"><b>Fish for food</b><small>Face the water and press E to cast. When the bobber dives, press E, then hold E to keep the green bar over the fish.</small></div></div>
      <div class="row-item">${ICON.belly}<div class="t"><b>Keep your belly full</b><small>Cook fish at the campfire (much more filling), then press F to eat. Hungry keepers walk slowly.</small></div></div>
      <div class="row-item">${ICON.wave}<div class="t"><b>Mind the tide</b><small>The sea rises and falls twice a day. Low tide uncovers clams, shells and the sandbar to the lighthouse. High tide floods the beach and cuts the lighthouse off.</small></div></div>
      <div class="row-item">${ICON.boat}<div class="t"><b>Run the docks</b><small>Boats arrive at the end of the dock. Tie them up at the post (E) to trade. By day they sail in on their own.</small></div></div>
      <div class="row-item">${ICON.moon}<div class="t"><b>Light the way at night</b><small>At night boats wait out at sea. Climb the lighthouse and steer the beam to lead them around the rocks to the dock.</small></div></div>
      <div class="row-item">${ICON.house}<div class="t"><b>Build your home</b><small>Grow your tent into a cottage, then paint it and add extras from your door.</small></div></div>
      <div class="row-item">${ICON.boat}<div class="t"><b>Sail to other islands</b><small>Build a sailboat at the boatyard by the dock. Three islands nearby each pay double for something and sell things you can't get at home. Check the sea chart in the lighthouse.</small></div></div>
      <div class="row-item">${ICON.house}<div class="t"><b>Furnish the inside</b><small>Press Q at your door to go in. Press B to make furniture from wood, shells and coins, then place it. R rotates, X moves things.</small></div></div></div>
      <h3>Keys</h3><div class="keys"><span class="key">WASD</span>Walk (arrows work too)<span class="key">E</span>Use / chop / fish / reel<span class="key">Q</span>Go inside / outside<span class="key">B</span>Make furniture (inside)<span class="key">R / X</span>Rotate / move furniture<span class="key">F</span>Eat<span class="key">J</span>Journal<span class="key">Esc</span>Menu<span class="key">Wheel</span>Zoom</div>
      <div style="margin-top:14px"><button class="btn primary" data-act="back">Got it</button></div>`;
    return this.frame('How to play', '', '', body);
  }

  p_confirm(p) {
    const body = `<p style="font-weight:600;margin-top:0">${p.data.text}</p><div style="display:flex;gap:10px"><button class="btn danger" data-act="${p.data.yes}">Yes</button><button class="btn" data-act="${p.data.no || 'close'}">No</button></div>`;
    return this.frame(p.data.title, '', '', body);
  }

  p_title(p) {
    const has = p.data.hasSave;
    return `<div class="title"><div class="logo"><h1>TINY<br><span>HARBOR</span></h1><p>Run the docks · light the way · build a home</p></div>
      <div class="menu">${has ? `<button class="btn primary" data-act="continue">Continue · Day ${p.data.day}</button>` : ''}
      <button class="btn ${has ? '' : 'primary'}" data-act="newgame">${has ? 'New island' : 'Play'}</button>
      <button class="btn" data-act="howto">How to play</button>
      <button class="btn" data-act="settings">Settings</button></div>
      <div class="credit">a PLAYPILE game</div></div>`;
  }
}

export { FISH_BY_ID };
