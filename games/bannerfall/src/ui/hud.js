// BANNERFALL :: ui/hud.js - top bar, toasts, battle squad cards, command bar, minimap, tips.
import { ICON, UNIT_ICON } from './icons.js';
import { ABILITIES } from '../data/units.js';

const $ = (id) => document.getElementById(id);
const fmt = (t) => { t = Math.max(0, Math.ceil(t)); return Math.floor(t / 60) + ':' + String(t % 60).padStart(2, '0'); };

export function createHUD(G) {
  const top = $('top'), toasts = $('toasts'), bottom = $('bottom'), right = $('right'), left = $('left'), tip = $('tip');
  let sigTop = '', sigBottom = '', sigRight = '';

  let lastToast = '', lastToastT = 0;
  function toast(text, cls = '') {
    const now = performance.now();
    if (text === lastToast && now - lastToastT < 2500) return;
    lastToast = text; lastToastT = now;
    const d = document.createElement('div');
    d.className = 'toast parch ' + cls;
    d.textContent = text;
    toasts.appendChild(d);
    while (toasts.children.length > 4) toasts.removeChild(toasts.firstChild);
    setTimeout(() => { d.style.transition = 'opacity 0.5s'; d.style.opacity = '0'; }, 3200);
    setTimeout(() => d.remove(), 3800);
  }
  function showTip(title, text) {
    if (!text) { tip.classList.remove('show'); return; }
    tip.innerHTML = `<span class="tt">${title}</span>${text}`;
    tip.classList.add('show');
  }

  function renderTop() {
    const w = G.world;
    if (!w) { top.innerHTML = ''; return; }
    const def = w.def;
    let phase = '', timer = '', wave = '';
    if (G.mode === 'prepare') { phase = 'Prepare'; timer = def.name; }
    else {
      phase = def.name;
      timer = fmt(def.timeLimit - w.t);
      const next = def.enemy.waves.findIndex((x, i) => !w.ai.spawned[i]);
      wave = next >= 0 ? `Wave ${next + 1} in ${fmt(def.enemy.waves[next].t - w.t)}` : w.ai.retreat ? 'Retreat!' : 'Last wave';
      if (w.flag.hold > 0.5) wave = `Windmill falling ${fmt(30 - w.flag.hold)}`;
    }
    const sig = [G.mode, w.teams[0].gold, phase, timer, wave, G.paused, G.speed].join('|');
    if (sig === sigTop) return;
    sigTop = sig;
    top.innerHTML = `
      <div class="seg parch gold"><span class="coin"></span><b>${w.teams[0].gold}</b> g</div>
      <div class="seg parch"><span class="phase">${phase}</span><span class="timer">${timer}</span>${wave ? `<span class="wave">${wave}</span>` : ''}</div>
      ${G.mode === 'battle' ? `<div class="seg parch" style="padding:4px 6px;gap:4px">
        <button data-a="pause" title="Pause (Space)" class="${G.paused ? 'on' : ''}" style="width:40px">${G.paused ? ICON.play : ICON.pause}</button>
        <button data-a="speed" data-v="0.5" class="${G.speed === 0.5 ? 'on' : ''}" title="Slow ([)">½×</button>
        <button data-a="speed" data-v="1" class="${G.speed === 1 ? 'on' : ''}" title="Normal (\\)">1×</button>
        <button data-a="speed" data-v="2" class="${G.speed === 2 ? 'on' : ''}" title="Fast (])">2×</button>
      </div>` : ''}
      <div class="seg parch" style="padding:4px 6px"><button data-a="menu" title="Menu (Esc)">☰</button></div>`;
    top.querySelectorAll('button svg').forEach((s) => { s.style.width = '18px'; s.style.height = '18px'; });
  }
  top.addEventListener('click', (e) => {
    const b = e.target.closest('button'); if (!b) return;
    const a = b.dataset.a;
    if (a === 'pause') G.setPause(!G.paused);
    if (a === 'speed') G.setSpeed(Number(b.dataset.v));
    if (a === 'menu') G.openMenu();
  });

  // ---- battle bottom: squad cards
  function squadCard(sq) {
    let hp = 0, mx = 0; for (const so of sq.soldiers) { if (so.alive) hp += so.hp; mx += so.maxHp; }
    const st = sq.state === 'routing' ? '<span class="tag rout">Routing</span>' : sq.state === 'wavering' ? '<span class="tag waver">Wavering</span>' : sq.entrenched ? '<span class="tag ent">Dug in</span>' : sq.garrison ? '<span class="tag ent">Tower</span>' : '';
    const grp = Object.entries(G.groups).find(([k, v]) => v.includes(sq.id));
    const cls = 'sqcard' + (G.sel.has(sq.id) ? ' sel' : '') + (sq.state === 'routing' ? ' routing' : '') + (sq.alive <= 0 || sq.state === 'gone' ? ' dead' : '');
    if (G.manyCards) {
      // big armies get small tiles: icon, men left, health and morale
      const tag = sq.state === 'routing' ? 'R' : sq.state === 'wavering' ? '!' : sq.entrenched || sq.garrison ? '⛨' : '';
      const tip = `${sq.name} · ${sq.stance} · ${sq.formation}${st ? ' · ' + st.replace(/<[^>]+>/g, '') : ''}`;
      return `<div class="${cls} mini" data-id="${sq.id}" title="${tip}">
        ${grp ? `<span class="grp">${grp[0]}</span>` : ''}
        <div class="mi">${ICON[UNIT_ICON[sq.type]]}<b>${Math.max(0, sq.alive)}</b>${tag ? `<span class="st">${tag}</span>` : ''}</div>
        <div class="bar"><i style="width:${mx ? (hp / mx) * 100 : 0}%"></i></div>
        <div class="bar m"><i style="width:${Math.max(0, Math.min(100, sq.moraleEff))}%"></i></div>
      </div>`;
    }
    return `<div class="${cls}" data-id="${sq.id}">
      ${grp ? `<span class="grp">${grp[0]}</span>` : ''}
      <div class="nm">${sq.name}</div>
      <div class="meta"><span>${Math.max(0, sq.alive)}/${sq.menMax} men</span><span>${st}</span></div>
      <div class="bar"><i style="width:${mx ? (hp / mx) * 100 : 0}%"></i></div>
      <div class="bar m"><i style="width:${Math.max(0, Math.min(100, sq.moraleEff))}%"></i></div>
      <div class="ico"><span class="tag">${sq.formation}</span><span class="tag">${sq.stance}</span>${sq.abilityCd > 0 ? `<span class="tag">${Math.ceil(sq.abilityCd)}s</span>` : ''}</div>
    </div>`;
  }
  function renderBattleBottom() {
    const w = G.world;
    const ord = { commander: 0, spear: 1, sword: 2, knight: 3, outrider: 4, archer: 5, xbow: 6, healer: 7 };
    const mine = [...w.squads.values()].filter((s) => s.team === 0 && (s.deployed || s.lost > 0)).sort((p, q) => (ord[p.type] ?? 9) - (ord[q.type] ?? 9));
    const sig = mine.map((s) => [s.id, s.alive, Math.round(s.moraleEff / 4), s.state, s.entrenched, s.formation, s.stance, G.sel.has(s.id), Math.ceil(s.abilityCd), s.garrison ? 1 : 0, Math.round(s.soldiers.reduce((a, so) => a + (so.alive ? so.hp : 0), 0) / 25)].join(',')).join('|') + JSON.stringify(G.groups);
    if (sig === sigBottom) return;
    G.manyCards = mine.length > 10;
    sigBottom = sig;
    bottom.className = '';
    bottom.innerHTML = `<div class="cards squads parch">${mine.map(squadCard).join("")}</div>`;
  }
  bottom.addEventListener('click', (e) => {
    if (G.mode !== 'battle' && G.mode !== 'over') return;
    const c = e.target.closest('.sqcard'); if (!c) return;
    G.select([c.dataset.id], e.shiftKey);
  });
  bottom.addEventListener('dblclick', (e) => {
    const c = e.target.closest('.sqcard'); if (!c) return;
    const sq = G.world.squads.get(c.dataset.id); if (sq) G.cam.focus(sq.cx, sq.cz);
  });

  // ---- command bar
  function renderCmd() {
    const sel = [...G.sel].map((id) => G.world.squads.get(id)).filter(Boolean);
    const one = sel[0];
    const has = (k, v) => sel.length && sel.every((s) => s[k] === v);
    const ab = one ? ABILITIES[one.def.ability] : null;
    const sig = [G.mode, sel.map((s) => s.id + s.formation + s.stance + Math.ceil(s.abilityCd) + s.shieldWall).join(',')].join('|');
    if (sig === sigRight) return;
    sigRight = sig;
    if (!sel.length) { right.innerHTML = `<div class="panel parch" style="max-width:260px;font-size:14px"><b class="cinzel">Command</b><br>Click a soldier or drag a box to select. Right-click to move, right-drag to set a line and its facing. <b>Space</b> pauses.</div>`; return; }
    right.innerHTML = `<div class="cmdbar parch">
      <div class="lbl">Formation</div>
      <button data-c="formation" data-v="line" class="${has('formation', 'line') ? 'on' : ''}" title="Line (Z)">${ICON.line}<small>Z</small></button>
      <button data-c="formation" data-v="wedge" class="${has('formation', 'wedge') ? 'on' : ''}" title="Wedge (X): melee and cavalry, +20% charge">${ICON.wedge}<small>X</small></button>
      <button data-c="formation" data-v="loose" class="${has('formation', 'loose') ? 'on' : ''}" title="Loose (C): spread out">${ICON.loose}<small>C</small></button>
      <button data-c="halt" title="Halt (Backspace)">${ICON.halt}<small>Halt</small></button>
      <div class="lbl">Stance</div>
      <button data-c="stance" data-v="hold" class="${has('stance', 'hold') ? 'on' : ''}" title="Hold (H): stay, spears brace">${ICON.hold}<small>H</small></button>
      <button data-c="stance" data-v="aggressive" class="${has('stance', 'aggressive') ? 'on' : ''}" title="Aggressive (G): chase within 35 m">${ICON.aggressive}<small>G</small></button>
      <button data-c="stance" data-v="skirmish" class="${has('stance', 'skirmish') ? 'on' : ''}" title="Skirmish (K): keep distance">${ICON.skirmish}<small>K</small></button>
      <button data-c="retreat" title="Retreat to the healers (R)">${ICON.retreat}<small>R</small></button>
      <div class="lbl">${sel.length === 1 ? one.name : sel.length + ' squads'}</div>
      <button data-c="ability" style="grid-column: span 4; flex-direction: row; gap: 6px" title="${ab ? ab.desc : ''}" ${one && one.abilityCd > 0 ? 'disabled' : ''}>${ICON.ability} ${ab ? ab.name : 'Ability'} <small>F${one && one.abilityCd > 0 ? ' ' + Math.ceil(one.abilityCd) + 's' : ''}</small></button>
    </div>`;
    right.querySelectorAll('svg').forEach((s) => { s.style.width = '20px'; s.style.height = '20px'; });
  }
  right.addEventListener('click', (e) => {
    const b = e.target.closest('button'); if (!b || G.mode === 'prepare') return;
    const c = b.dataset.c; if (!c) return;
    G.order({ type: c, value: b.dataset.v });
  });

  // ---- minimap
  const mm = $('minimap'), mx = mm.getContext('2d');
  let base = null, baseV = -1;
  function paintBase() {
    const w = G.world, hf = w.terrain, N = 200;
    base = document.createElement('canvas'); base.width = base.height = N;
    const g = base.getContext('2d');
    const img = g.createImageData(N, N);
    for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
      const x = hf.size - (i + 0.5) * (hf.size / N), z = hf.size - (j + 0.5) * (hf.size / N);
      const h = hf.height(x, z), m = hf.matAt(x, z);
      let c = [156, 168, 98];
      if (m === 1) c = [176, 150, 105]; else if (m === 2) c = [96, 70, 46]; else if (m === 3) c = [150, 145, 132]; else if (m === 4) c = [120, 150, 160];
      if (h < hf.waterLevel - 0.05) c = [104, 146, 168];
      const sh = Math.max(0.75, Math.min(1.2, 1 + (hf.height(x - 1, z - 1) - h) * 0.12 + h * 0.012));
      const k = (j * N + i) * 4;
      img.data[k] = c[0] * sh; img.data[k + 1] = c[1] * sh; img.data[k + 2] = c[2] * sh; img.data[k + 3] = 255;
    }
    g.putImageData(img, 0, 0);
    // parchment wash
    g.fillStyle = 'rgba(239,226,194,0.28)'; g.fillRect(0, 0, N, N);
    for (const t of w.trees) { g.fillStyle = 'rgba(52,78,40,0.85)'; g.beginPath(); g.arc((hf.size - t.x) * N / hf.size, (hf.size - t.z) * N / hf.size, 2.2 * t.s, 0, 6.28); g.fill(); }
  }
  function drawMini() {
    const w = G.world; if (!w) return;
    const hf = w.terrain, N = 200, k = N / hf.size;
    if (baseV !== hf.version) { baseV = hf.version; paintBase(); }
    mx.drawImage(base, 0, 0);
    const P = (x, z) => [(hf.size - x) * k, (hf.size - z) * k];
    // deploy zone + flag
    if (G.mode === 'prepare') {
      mx.strokeStyle = 'rgba(40,90,180,0.9)'; mx.setLineDash([4, 3]); mx.lineWidth = 1.5; mx.beginPath();
      w.def.zones.player.forEach((p, i) => { const [a, b] = P(p[0], p[1]); i ? mx.lineTo(a, b) : mx.moveTo(a, b); }); mx.closePath(); mx.stroke(); mx.setLineDash([]);
    }
    const F = w.def.zones.flag; const [fx, fz] = P(F.pos[0], F.pos[1]);
    mx.strokeStyle = w.flag.hold > 0 ? '#c0301e' : '#c9a43b'; mx.lineWidth = 2; mx.beginPath(); mx.arc(fx, fz, F.r * k, 0, 6.28); mx.stroke();
    // structures
    mx.strokeStyle = '#4a3420'; mx.lineWidth = 2.2;
    for (const s of w.structures.values()) {
      if (!s.alive) continue;
      if (s.kind === 'tower') { const [a, b] = P(s.pos[0], s.pos[1]); mx.fillStyle = '#4a3420'; mx.fillRect(a - 2.5, b - 2.5, 5, 5); continue; }
      const [a, b] = P(s.a[0], s.a[1]), [c, d] = P(s.b[0], s.b[1]);
      mx.strokeStyle = s.kind === 'obstacle' ? '#7a5a3a' : s.kind === 'gate' ? '#8a6440' : '#3a2818';
      mx.beginPath(); mx.moveTo(a, b); mx.lineTo(c, d); mx.stroke();
    }
    // squads
    for (const sq of w.squads.values()) {
      if (!sq.deployed || sq.alive <= 0 || sq.state === 'gone') continue;
      const [a, b] = P(sq.cx, sq.cz);
      mx.fillStyle = sq.team === 0 ? (G.sel.has(sq.id) ? '#fff1c4' : '#2f5fa8') : '#b8302a';
      mx.strokeStyle = '#1a120a'; mx.lineWidth = 1;
      mx.beginPath(); mx.arc(a, b, sq.def.tags.includes('cavalry') ? 3.6 : 3, 0, 6.28); mx.fill(); mx.stroke();
    }
    // camera footprint
    const c = G.cam.S, [ca, cb] = P(c.x, c.z);
    mx.strokeStyle = 'rgba(255,250,230,0.95)'; mx.lineWidth = 1.5;
    const r = c.dist * 0.55 * k;
    mx.save(); mx.translate(ca, cb); mx.rotate(-(c.yaw - Math.PI)); mx.strokeRect(-r, -r * 0.7, 2 * r, 1.4 * r); mx.restore();
  }
  function miniToWorld(e) {
    const r = mm.getBoundingClientRect(), hf = G.world.terrain;
    const u = (e.clientX - r.left) / r.width, v = (e.clientY - r.top) / r.height;
    return [hf.size - u * hf.size, hf.size - v * hf.size];
  }
  let miniDrag = false;
  mm.addEventListener('pointerdown', (e) => { if (!G.world) return; miniDrag = true; const p = miniToWorld(e); if (e.button === 2 && G.sel.size) G.order({ type: 'move', to: p }); else G.cam.focus(p[0], p[1]); e.stopPropagation(); });
  mm.addEventListener('pointermove', (e) => { if (miniDrag && e.buttons & 1) { const p = miniToWorld(e); G.cam.focus(p[0], p[1]); } });
  window.addEventListener('pointerup', () => { miniDrag = false; });
  mm.addEventListener('contextmenu', (e) => e.preventDefault());

  function reset() { sigTop = sigBottom = sigRight = ''; baseV = -1; }
  function update() {
    renderTop();
    if (G.mode === 'battle' || G.mode === 'over') { renderBattleBottom(); renderCmd(); left.innerHTML = ''; left.className = 'empty'; }
    drawMini();
  }
  return { update, toast, showTip, reset, renderCmd };
}
