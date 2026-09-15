// The in-run competition furniture: the marker posts out in the world, and the
// clock and leaderboard over the top.

import { P } from '../art/palette.js';
import { text, textWidth } from './font.js';

// Marker posts, drawn in world space with the rest of the scenery.
export function drawTargets(v, comp, park, sk, clock) {
  if (!comp || !comp.spots.length) return;
  const left = v.left() - 40, right = v.right() + 40;
  const line = comp.def.kind === 'line';

  for (let i = 0; i < comp.spots.length; i++) {
    const sp = comp.spots[i];
    if (sp.x < left || sp.x > right) continue;
    const active = !line || i === comp.next;
    const gy = park.groundY(sp.x);
    const bob = Math.sin(clock * 3 + i) * 1.5;

    if (sp.done) {
      // A spot you have been to leaves a stub. On a LINE you get one go at each,
      // so the stub has to say WHICH way it went -- green for cleared, red for
      // burned -- or a line you fluffed looks identical to one you rode clean.
      v.rect(sp.x - 5, gy - 4, 10, 3, P.ink);
      v.rect(sp.x - 4, gy - 3, 8, 1, sp.failed ? P.bad : P.good);
      if (sp.failed) {
        v.line(sp.x - 3, gy - 10, sp.x + 3, gy - 4, P.bad);
        v.line(sp.x + 3, gy - 10, sp.x - 3, gy - 4, P.bad);
      }
      continue;
    }
    const col = active ? P.ui1 : P.ink3;
    const top = gy - 34 + bob;
    // beam
    for (let y = gy - 2; y > top; y -= 4) v.rect(sp.x, y, 1, 2, col);
    // ring on the floor
    v.ring(sp.x, gy - 1, 9, col);
    v.ring(sp.x, gy - 1, 6, active ? P.ui2 : P.ink3);
    // the label
    if (active) {
      const w = textWidth(sp.need, 1) + 6;
      v.rect(sp.x - w / 2, top - 10, w, 10, 'rgba(26,20,32,0.8)');
      v.frame(sp.x - w / 2, top - 10, w, 10, P.ui1);
      text(v, sp.need, sp.x, top - 8, P.ui1, { align: 'center' });
      if (line) text(v, String(i + 1), sp.x, top - 19, P.ui3, { align: 'center', outline: P.ink });
    }
  }
  void sk;
}

// Clock, leaderboard and the current instruction.
export function drawCompHud(v, comp, score) {
  if (!comp) return;
  v.ui();
  const W = v.W;
  const def = comp.def;

  // --- the clock -------------------------------------------------------------
  const frac = comp.t / def.time;
  const cw = 120;
  v.rect(W / 2 - cw / 2 - 1, 4, cw + 2, 12, 'rgba(26,20,32,0.8)');
  v.frame(W / 2 - cw / 2 - 1, 4, cw + 2, 12, P.ink2);
  v.rect(W / 2 - cw / 2, 12, Math.round(cw * frac), 3, comp.t < 15 ? P.bad : P.ui3);
  const secs = Math.ceil(comp.t);
  const mm = Math.floor(secs / 60), ss = secs % 60;
  text(v, def.name + '  ' + mm + ':' + (ss < 10 ? '0' : '') + ss, W / 2, 6,
    comp.t < 15 ? P.bad : P.ui4, { align: 'center' });

  // --- the leaderboard -------------------------------------------------------
  const mine = comp.live();
  const rows = comp.rivals.map((r) => ({ name: r.name, score: r.score }));
  rows.push({ name: 'YOU', score: mine, you: true });
  rows.sort((a, b) => b.score - a.score);
  const bx = W - 92, by = 30;
  v.rect(bx - 2, by - 2, 90, rows.length * 9 + 4, 'rgba(26,20,32,0.72)');
  v.frame(bx - 2, by - 2, 90, rows.length * 9 + 4, P.ink2);
  rows.forEach((r, i) => {
    const col = r.you ? P.ui1 : P.ui4;
    text(v, (i + 1) + '.', bx + 2, by + i * 9, col);
    text(v, r.name, bx + 12, by + i * 9, col);
    text(v, String(r.score), bx + 86, by + i * 9, col, { align: 'right' });
  });

  // --- what to do next -------------------------------------------------------
  if (comp.spots.length) {
    const line = def.kind === 'line';
    const nextSpot = line ? comp.spots[comp.next]
      : comp.spots.find((s) => !s.done);
    const cleared = comp.spots.filter((s) => s.done).length;
    text(v, cleared + ' / ' + comp.spots.length + ' SPOTS', 6, 34, P.ui3, { shadow: P.ink });
    if (nextSpot) {
      text(v, 'NEXT: ' + nextSpot.need, 6, 43, P.ui1, { shadow: P.ink });
    }
  }

  if (comp.flashT > 0) {
    text(v, comp.flash, W / 2, 60, P.good, { align: 'center', outline: P.ink, scale: 1 });
  }
  void score;
}
