// Greedy autoplayer used by the headless test (tools/bot.mjs) and the attract/demo mode (?bot).
const T = 32;
export function botThink(G) {
  const p = G.p, L = G.L, m = G.botMem, out = { l: 0, r: 0, jump: 0, down: 0 };
  const S = (x, y) => { const c = G.tileAt(x, y); return c === '#' || c === 'B'; };
  const O = (x, y) => { const c = G.tileAt(x, y); return c === '#' || c === 'B' || c === '='; };
  const cx = p.x + p.w / 2, by = p.y + p.h, row = Math.floor((by - 1) / T);
  const safeBelow = (col) => { for (let y = Math.max(0, row); y < L.h; y++) if (O(col, y)) return G.tileAt(col, y - 1) !== '^'; return false; };
  let dir = 1, want = false;
  const B = G.boss;
  if (B && B.st !== 'dead') {
    const bc = B.x + B.w / 2, dx = bc - cx, open = B.st === 'dizzy' || B.st === 'spit';
    let tx = open ? bc : bc + (cx < bc ? -200 : 200);
    if (tx < 60 || tx > L.w * T - 60) tx = bc + (cx < bc ? 200 : -200);
    dir = Math.abs(tx - cx) < 16 ? 0 : Math.sign(tx - cx);
    if (p.on) {
      const wave = G.waves.some((w) => Math.abs(w.x - cx) < 90 && Math.sign(cx - w.x) === w.dir);
      const charging = B.st === 'charge' && B.t > 0.5 && Math.abs(dx) < 170 && Math.sign(B.vx) === Math.sign(-dx);
      if (wave || charging || (open && Math.abs(dx) < 120)) want = true;
    } else {
      if (m.hold > 0) out.jump = 1;
      if (Math.abs(dx) < 34 && by < B.y + 4) out.down = 1;
      else if (by < B.y + 10) dir = Math.sign(dx);
    }
  } else {
    if (G.exitOpen && L.exit) dir = Math.sign(L.exit.x + 24 - cx) || 1;
    if (p.on) {
      const fc = Math.floor((cx + dir * 22) / T);
      const wallAhead = S(fc, row) || S(fc, row - 1);
      const gc = Math.floor((cx + dir * 18) / T);
      let ground = false; for (let y = row + 1; y < L.h; y++) if (O(gc, y)) { ground = true; break; }
      const spike = G.tileAt(fc, row) === '^' || G.tileAt(fc + dir, row) === '^';
      const foe = G.en.some((e) => !e.dead && e.gum <= 0 && Math.abs(e.y - p.y) < 50 && (e.x + e.w / 2 - cx) * dir > 0 && (e.x + e.w / 2 - cx) * dir < 80);
      if (wallAhead || !ground || spike || foe) want = true;
    } else if (p.wall) {
      out.jump = m.pj ? 0 : 1;
    } else {
      let safe = false; for (let k = 0; k < 4 && !safe; k++) safe = safeBelow(Math.floor((cx + dir * k * T) / T));
      if (!safe && p.gum > 0.02) out.jump = 1;
      else if (m.hold > 0) out.jump = 1;
      for (const e of G.en) if (!e.dead && e.gum <= 0 && Math.abs(e.x + e.w / 2 - cx) < 16 && e.y > p.y && e.y - p.y < 130 && safeBelow(Math.floor(cx / T))) out.down = 1;
    }
  }
  if (want) { if (m.pj && p.on) out.jump = 0; else { out.jump = 1; m.hold = 0.3; } }
  m.hold = (m.hold || 0) - 1 / 120;
  out.r = dir > 0 ? 1 : 0; out.l = dir < 0 ? 1 : 0;
  m.pj = out.jump;
  return out;
}
