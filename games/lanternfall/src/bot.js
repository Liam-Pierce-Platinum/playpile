// A simple autopilot. It plays the title-screen attract mode and the headless
// playthrough tests the way a decent player would: let weak things drift into
// the light, keep the dangerous ones at arm's length, circle, hoover up embers,
// grab chests and golden moths, and step out of the Warden's grasp.
import { UP } from './data.js';

const DANGER = { moth: 0.35, wolf: 1.6, tree: 2.2, wraith: 1.4, brood: 1.6, lumen: 0, stag: 5, warden: 9 };

export function botMove(g) {
  const p = g.p, A = g.E.a;
  const hpK = p.hp / g.s.maxHp;
  let fx = 0, fy = 0, cnt = 0, ccx = 0, ccy = 0;
  const keep = g.R * 0.45;  // let enemies come this deep into the light
  for (let i = 0; i < g.E.n; i++) {
    const e = A[i]; if (e.dead) continue;
    const dx = p.x - e.x, dy = p.y - e.y, d = Math.hypot(dx, dy) || 1;
    if (d < 420) { ccx += e.x; ccy += e.y; cnt++; }
    let w = DANGER[e.type] || 1;
    if (e.st === 'dash' || e.st === 'lunge' || e.st === 'wind') w *= 3;
    if (e.type === 'warden') {
      // fight the Warden the way the game asks: keep it at the edge of the light (where it burns 3x and the close
      // weapons reach it), step back only from its charge
      if (e.st === 'charge') w = 9;
      else { const want = g.R * 0.75; if (d > want + 30) { fx -= dx / d * 1.2; fy -= dy / d * 1.2; continue; } w = d < want - 40 ? 4 : 0.6; }
    }
    const reach = e.r + (w > 1.5 ? 90 : keep);
    if (d > reach + 60) continue;
    const k = w * Math.max(0, 1 - (d - e.r) / (reach + 60)) * (hpK < 0.4 ? 1.8 : 1);
    fx += dx / d * k; fy += dy / d * k;
  }
  for (let i = 0; i < g.orbs.n; i++) {
    const o = g.orbs.a[i], dx = p.x - o.x, dy = p.y - o.y, d = Math.hypot(dx, dy) || 1;
    if (d < 110) { const k = 4 * (1 - d / 110); fx += dx / d * k; fy += dy / d * k; }
  }
  for (const gr of g.grasps) {
    const dx = p.x - gr.x, dy = p.y - gr.y, d = Math.hypot(dx, dy) || 1;
    if (d < gr.r + 30 && !gr.done) { fx += dx / d * 8; fy += dy / d * 8; }
  }
  const danger = Math.hypot(fx, fy);
  // goals: chests > golden moths > embers > the crowd (to feed the light)
  let tx = 0, ty = 0, best = 1e9, pull = 0;
  // a chest or a golden moth is worth walking through a few moths for: commit to it
  for (const k of g.pickups) { if (k.kind === 'flask' && hpK > 0.7) continue; const d = Math.hypot(k.x - p.x, k.y - p.y); if (d < best) { best = d; tx = k.x; ty = k.y; pull = d < 500 ? 3.2 : 1.6; } }
  if (!pull) for (let i = 0; i < g.E.n; i++) { const e = A[i]; if (e.type === 'lumen' && !e.dead) { tx = e.x; ty = e.y; best = 1; pull = 3; } }
  if (!pull) {
    for (let i = 0; i < g.embers.n; i++) { const m = g.embers.a[i]; const d = Math.hypot(m.x - p.x, m.y - p.y); if (d < best && d < 300) { best = d; tx = m.x; ty = m.y; pull = 0.6; } }
  }
  
  let ax = 0, ay = 0;
  if (pull) { const d = Math.hypot(tx - p.x, ty - p.y) || 1; ax = (tx - p.x) / d * pull; ay = (ty - p.y) / d * pull; }
  // a slow circle keeps the crowd strung out behind us
  g._botA = (g._botA || 0) + 0.007;
  const circ = pull >= 3 ? 0 : 0.7;
  let mx = fx * 1.6 + ax + Math.cos(g._botA) * circ, my = fy * 1.6 + ay + Math.sin(g._botA) * circ;
  if (danger > 0.2 && pull && pull < 1.3) { mx -= ax * 0.5; my -= ay * 0.5; }
  const m = Math.hypot(mx, my);
  if (m < 0.05) return { x: 0, y: 0 };
  return { x: mx / m, y: my / m };
}

export function botPick(g, cards) {
  let best = 0, bs = -1;
  cards.forEach((c, i) => {
    const d = UP[c.id];
    let s = 1;
    if (d.kind === 'active') s = g.items[c.id] ? 6 + g.items[c.id] * 0.1 : (g.actives.length < 4 ? 5 : 2);   // finish what it started
    if (d.kind === 'passive') {
      s = 2;
      for (const a of g.actives) if (UP[a].with === c.id) s = 7;
      if (g.items[c.id]) s += 1;
    }
    if (d.kind === 'lantern') s = 3.5;
    if (s > bs) { bs = s; best = i; }
  });
  return best;
}
