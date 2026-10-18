// Helpers for chapter I (lab.js, COLD STORAGE: the lab breakout and the courtyard).
// Walls with holes, rooms, grey set dressing, tutorial cards, a big centre prompt, a skill watcher, torn metal.
// Owned by the lab builder; nothing outside src/levels/lab* uses it.

// ---- walls with rectangular holes (doors, windows, vent mouths) ----
// a wall along x at z, from x0 to x1. holes: [{ c (centre x), w, y0 = 0, y1 }]
export function wallX(L, z, x0, x1, o = {}, holes = []) {
  const h = o.h || 4, t = o.t || 0.3, y = o.y || 0, m = { mat: o.mat || 'paint', tile: o.tile };
  const hs = [...holes].sort((a, b) => a.c - b.c); let s = x0;
  for (const H of hs) {
    const a = H.c - H.w / 2, b = H.c + H.w / 2, y0 = H.y0 || 0, y1 = Math.min(h, H.y1 ?? h);
    if (a - s > 0.01) L.box((s + a) / 2, y, z, a - s, h, t, m);
    if (y0 > 0.01) L.box(H.c, y, z, H.w, y0, t, m);
    if (h - y1 > 0.01) L.box(H.c, y + y1, z, H.w, h - y1, t, m);
    s = b;
  }
  if (x1 - s > 0.01) L.box((s + x1) / 2, y, z, x1 - s, h, t, m);
}
// a wall along z at x, from z0 to z1. holes: [{ c (centre z), w, y0, y1 }]
export function wallZ(L, x, z0, z1, o = {}, holes = []) {
  const h = o.h || 4, t = o.t || 0.3, y = o.y || 0, m = { mat: o.mat || 'paint', tile: o.tile };
  const hs = [...holes].sort((a, b) => a.c - b.c); let s = z0;
  for (const H of hs) {
    const a = H.c - H.w / 2, b = H.c + H.w / 2, y0 = H.y0 || 0, y1 = Math.min(h, H.y1 ?? h);
    if (a - s > 0.01) L.box(x, y, (s + a) / 2, t, h, a - s, m);
    if (y0 > 0.01) L.box(x, y, H.c, t, y0, H.w, m);
    if (h - y1 > 0.01) L.box(x, y + y1, H.c, t, h - y1, H.w, m);
    s = b;
  }
  if (z1 - s > 0.01) L.box(x, y, (s + z1) / 2, t, h, z1 - s, m);
}
// a rectangular room x0..x1, z0..z1. o: { h, mat, ceil: true | 'none', ceilMat, n/s/w/e: holes, skip: ['n', ...] }
// n = the z0 wall, s = the z1 wall, w = the x0 wall, e = the x1 wall
export function room(L, x0, z0, x1, z1, o = {}) {
  const sk = o.skip || [], wo = { h: o.h || 4, mat: o.mat || 'paint', tile: o.tile };
  if (!sk.includes('n')) wallX(L, z0, x0, x1, wo, o.n);
  if (!sk.includes('s')) wallX(L, z1, x0, x1, wo, o.s);
  if (!sk.includes('w')) wallZ(L, x0, z0, z1, wo, o.w);
  if (!sk.includes('e')) wallZ(L, x1, z0, z1, wo, o.e);
  if (o.ceil !== 'none' && o.ceil !== false) L.box((x0 + x1) / 2, wo.h, (z0 + z1) / 2, x1 - x0 + 0.3, 0.3, z1 - z0 + 0.3, { mat: o.ceilMat || 'concreteDark' });
}

// ---- grey set dressing (visual only unless noted) ----
export function pipe(L, x0, y, z0, x1, z1, r = 0.09) { // a straight pipe along x or z
  const T = L.THREE, len = Math.hypot(x1 - x0, z1 - z0), g = new T.CylinderGeometry(r, r, len, 6);
  const m = L.mesh(g, 'steel', (x0 + x1) / 2, y, (z0 + z1) / 2);
  if (Math.abs(x1 - x0) > Math.abs(z1 - z0)) m.rotation.z = Math.PI / 2; else m.rotation.x = Math.PI / 2;
  return m;
}
export function monitor(L, x, y, z, yaw = 0) { // a screen on a stand
  const T = L.THREE, g = new T.Group();
  const s = new T.Mesh(new T.BoxGeometry(0.55, 0.36, 0.05), L.mat('black')); s.position.y = 0.28; g.add(s);
  const st = new T.Mesh(new T.BoxGeometry(0.06, 0.24, 0.06), L.mat('steel')); st.position.y = 0.06; g.add(st);
  g.position.set(x, y, z); g.rotation.y = yaw; return L.deco(g);
}
export function tank(L, x, z, o = {}) { // a specimen tank: glass cylinder on a steel base with a dim shape inside (collides)
  const T = L.THREE, r = o.r || 0.8, h = o.h || 2.6;
  L.box(x, 0, z, r * 1.6, h + 0.4, r * 1.6, { visible: false, see: true, flags: { noClimb: true } });
  L.mesh(new T.CylinderGeometry(r + 0.1, r + 0.15, 0.4, 10), 'steel', x, 0.2, z);
  L.mesh(new T.CylinderGeometry(r + 0.1, r + 0.1, 0.25, 10), 'steel', x, h + 0.28, z);
  const gl = L.mesh(new T.CylinderGeometry(r, r, h - 0.1, 12, 1, true), 'glass', x, 0.4 + (h - 0.1) / 2, z); gl.castShadow = false;
  if (o.body !== false) { const b = L.mesh(new T.CapsuleGeometry(0.22, 0.9, 2, 6), 'paintDark', x, 1.35, z); b.rotation.z = 0.15; b.castShadow = false; }
}
export function shelf(L, x, z, w, d, h = 2.2, axis = 'x') { // a steel rack with boxes (collides, cover)
  L.box(x, 0, z, axis === 'x' ? w : d, h, axis === 'x' ? d : w, { mat: 'metal', cover: true, tile: 1.5 });
}

// ---- tutorial card (right side), one at a time ----
export function tips(L) {
  const G = L.G, doc = globalThis.document;
  const el = doc?.createElement?.('div');
  if (el && el.style) {
    el.id = 'labtip';
    Object.assign(el.style, { position: 'fixed', right: '28px', top: '34%', width: 'min(330px, calc(100% - 56px))', padding: '12px 16px 12px 14px',
      background: 'rgba(0,0,0,.58)', borderLeft: '3px solid #7a0000', color: '#e8e8e8', font: '14px/1.45 Arial,sans-serif', letterSpacing: '0.5px',
      opacity: '0', transition: 'opacity .3s, transform .3s', transform: 'translateX(14px)', pointerEvents: 'none', zIndex: 3, textShadow: '0 0 6px #000' });
    doc.body?.appendChild?.(el);
  }
  const T = { cur: null, el };
  T.show = (id, title, body) => {
    T.cur = id; if (!el || !el.style) return;
    el.innerHTML = `<div style="font:13px Impact,sans-serif;letter-spacing:4px;color:#aaa;margin-bottom:5px">${title}</div>` + body.map(b => `<div style="margin-top:3px">${b}</div>`).join('');
    el.style.opacity = '1'; el.style.transform = 'none';
  };
  T.hide = (id) => { if (id && T.cur !== id) return; T.cur = null; if (el && el.style) { el.style.opacity = '0'; el.style.transform = 'translateX(14px)'; } };
  T.remove = () => { try { el?.remove?.(); } catch (_) {} };
  L.every(() => { if (el && el.style && T.cur) el.style.visibility = G.cut || G.paused ? 'hidden' : 'visible'; });
  return T;
}
export const key = k => `<b style="display:inline-block;padding:0 5px;border:1px solid #888;border-radius:2px;font:12px Arial;color:#fff;background:rgba(255,255,255,.08)">${k}</b>`;

// ---- what the player has done (drives the tutorial) ----
export function watcher(L) {
  const W = { L: false, R: false, aimed: false, uppercut: false, blocked: false, quick: false, parried: false, limb: false, finisher: false, crouched: false, climbed: false, crawled: false, lunge: false, swing: false, leap: false, slide: false, slam: false };
  let meter = 0, partN = null;
  L.every(() => {
    const G = L.G, h = G.hero; if (!h) return;
    const a = h.atk;
    if (a) { if (a.hand === 'L') W.L = true; if (a.hand === 'R') W.R = true; if (a.kind === 'aimed') W.aimed = true; if (a.kind === 'uppercut') W.uppercut = true; }
    if (h.blocking) { W.blocked = true; if (h.quickBlock > 0) W.quick = true; }
    for (const e of G.enemies) if (e.alive && e.state === 'down' && e.type !== 'scientist') W.parried = true;
    const lp = G.parts[G.parts.length - 1] || 0; if (partN === null) partN = lp; else if (lp !== partN) { W.limb = true; partN = lp; }
    if (meter >= 1 && G.finMeter < 0.3 && h.fin) W.finisher = true;
    meter = G.finMeter;
    if (h.crouching && !h.crawling) W.crouched = true;
    if (h.climbing) W.climbed = true;
    if (h.crawling) W.crawled = true;
    const st = h.step; if (st?.lunge) W.lunge = true; if (st?.swing && st.via) W.swing = true;
    if (h.wallJumpT > 0.2) W.leap = true; if (h.slide) W.slide = true; if (h.diving) W.slam = true;
  });
  W.resetParts = () => { partN = L.G.parts[L.G.parts.length - 1] || 0; W.limb = false; };
  return W;
}

// remove a group of enemies outright (a section the player has already cleared, on a checkpoint load)
export function cull(L, pred) {
  const G = L.G;
  for (const e of [...G.enemies]) {
    if (!pred(e)) continue;
    G.scene.remove(e.rig.root); e.rig.skin?.dispose?.(); if (e.laser) G.scene.remove(e.laser);
    e.alive = false; const i = G.enemies.indexOf(e); if (i >= 0) G.enemies.splice(i, 1);
  }
}
// the hero's claws out, also during a cutscene (the hero's own update is not running then)
export function clawsOut(G) {
  const h = G.hero; if (!h) return;
  if (!h.clawsOut) h.unsheathe(); h.ext = 1;
  for (const s of ['L', 'R']) for (const g of h.claws?.[s] || []) { g.visible = true; g.scale.y = Math.max(0.001, 1.08 * (h.CLAW_LEN || 1)); }
}

// ---- a big prompt in the middle of the screen (shown during a held shot, when the tip card is hidden) ----
export function bigPrompt(L) {
  const doc = globalThis.document, el = doc?.createElement?.('div');
  if (el && el.style) {
    Object.assign(el.style, { position: 'fixed', left: '50%', top: '64%', transform: 'translateX(-50%)', textAlign: 'center', color: '#f2f2f2', pointerEvents: 'none',
      zIndex: 5, opacity: '0', transition: 'opacity .35s', textShadow: '0 0 14px #000, 0 0 4px #000', maxWidth: 'calc(100% - 32px)' });
    doc.body?.appendChild?.(el);
  }
  let on = false, t = 0;
  L.every(dt => { if (!on || !el?.style) return; t += dt; el.style.opacity = String(0.72 + 0.28 * Math.sin(t * 5)); });
  return {
    show(title, sub) {
      on = true; t = 0; if (!el?.style) return;
      el.innerHTML = '<div style="font:clamp(30px,6vw,52px) Impact,sans-serif;letter-spacing:8px">' + title + '</div><div style="font:15px Arial,sans-serif;letter-spacing:3px;color:#bbb;margin-top:4px;text-transform:uppercase">' + sub + '</div>';
      el.style.opacity = '1';
    },
    hide() { on = false; if (el?.style) el.style.opacity = '0'; },
    remove() { try { el?.remove?.(); } catch (_) {} },
  };
}
// ---- torn metal: a box twisted about its length and bent (restraint halves, stubs) ----
export function twisted(T, w, h, d, twist = 2, bend = 0.1) {
  const g = new T.BoxGeometry(w, h, d, 6, 1, 1), p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i), u = x / w + 0.5, a = twist * u * u;
    p.setXYZ(i, x, y * Math.cos(a) - z * Math.sin(a) + bend * u * u, y * Math.sin(a) + z * Math.cos(a));
  }
  g.computeVertexNormals(); return g;
}
