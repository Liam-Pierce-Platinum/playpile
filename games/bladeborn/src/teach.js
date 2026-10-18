// Tutorial slow-mo: the first time a move becomes possible, time drops to a crawl, a prompt shows the key, and the
// game resumes the moment that key is pressed (the press still goes through to the hero). Each move is taught once
// per profile (localStorage; New Game clears it). Moves: block, parry, finisher, climb, leap, corner, slide, slam,
// takedown (+ any a level asks for with G.teach(id, title, keys, sub)).
const KEY = 'bladeborn.taught.v1';
const read = () => { try { return new Set(JSON.parse(localStorage.getItem(KEY) || '[]')); } catch (_) { return new Set(); } };
const write = s => { try { localStorage.setItem(KEY, JSON.stringify([...s])); } catch (_) {} };
export const clearTaught = () => { try { localStorage.removeItem(KEY); } catch (_) {} };

// input tokens -> the label on the chip and the events that resume
const LABEL = { KeyC: 'C', ControlLeft: 'CTRL', LMB: 'LMB', RMB: 'RMB', MMB: 'MIDDLE MOUSE', dbl: 'LMB LMB', Space: 'SPACE', KeyE: 'E', KeyS: 'S (hold)', KeyA: 'A', KeyD: 'D' };
const MOVES = {
  block: ['BLOCK', ['MMB'], 'Hold the middle mouse button: blocks his swing.'],
  parry: ['PARRY', ['MMB'], 'Block right as it lands: he drops to his knees.'],
  finisher: ['FINISHER', ['dbl'], 'The bar is full: double-click LMB on him.'],
  climb: ['CLAW IN', ['LMB', 'RMB'], 'Click near the wall: the claws bite in.'],
  leap: ['LEAP', ['Space'], 'Look at the next trunk or pillar and press SPACE.'],
  corner: ['SWING', ['KeyA', 'KeyD'], 'A / D swing round the corner on one claw.'],
  slide: ['SLIDE DOWN', ['KeyS'], 'Hold S: slide down on one dragging claw.'],
  slam: ['GROUND SLAM', ['dbl', 'LMB', 'RMB'], 'The same claw twice in the air: drive down.'],
  takedown: ['TAKEDOWN', ['KeyE'], 'He has not seen you. E: silent kill.'],
  sight: ['SEEN?', ['KeyC', 'ControlLeft'], 'The bar at the top is how much they see you. Crouch (C), break line of sight, get up high: they never look up.'],
};

export function installTeach(G) {
  try { if (/[?&]noteach/.test(location.search)) return; } catch (_) {}
  const taught = read();
  let el = null, cur = null, cool = 0;
  const show = (title, keys, sub) => {
    try {
      if (!el) { el = document.createElement('div'); el.id = 'teach'; el.style.cssText = 'position:absolute;left:0;right:0;top:58%;text-align:center;pointer-events:none;z-index:30;font:600 15px Arial;color:#fff;text-shadow:0 0 12px #000;transition:opacity .2s'; document.body.appendChild(el); }
      const chips = keys.map(k => `<b style="display:inline-block;margin:0 4px;padding:3px 9px;border:1px solid #ddd;border-radius:3px;background:rgba(160,20,20,.55);letter-spacing:2px">${LABEL[k] || k}</b>`).join(' / ');
      el.innerHTML = `<div style="font-size:28px;letter-spacing:8px;margin-bottom:8px">${title}</div>${chips}<div style="margin-top:8px;opacity:.85">${sub || ''}</div>`;
      el.style.opacity = 1;
    } catch (_) {}
  };
  const hide = () => { try { if (el) el.style.opacity = 0; } catch (_) {} };
  G.teach = (id, title, keys, sub) => {
    if (cur || taught.has(id) || !G.playing || G.cut) return false;
    const m = MOVES[id] || [title, Array.isArray(keys) ? keys : [keys], sub];
    cur = { id, keys: m[1], t: 0 }; show(title || m[0], m[1], sub || m[2]);
    return true;
  };
  // called from the input handlers with a token: 'LMB' 'RMB' 'MMB' or a key code
  G.teachInput = tok => {
    if (!cur) return;
    const ok = cur.keys.includes(tok) || (cur.keys.includes('dbl') && tok === 'LMB');
    if (!ok) return;
    taught.add(cur.id); write(taught); cur = null; cool = 2.5; hide();
  };
  G.teachScale = () => (cur ? 0.07 : 1);
  // per real-time frame: spot the first chance for each move
  G.teachTick = rdt => {
    if (cur) { cur.t += rdt; if (cur.t > 9 || G.cut || !G.playing) { taught.add(cur.id); write(taught); cur = null; hide(); } return; }
    if (!G.playing || G.paused || G.cut || G.over) return;
    cool -= rdt; if (cool > 0) return;
    const h = G.hero; if (!h || h.dead || h.fin) return;
    const try1 = id => !taught.has(id) && G.teach(id);
    const near = (e, r) => Math.hypot(e.pos.x - h.pos.x, e.pos.z - h.pos.z) < r && Math.abs(e.pos.y - h.pos.y) < 1.6;
    const foes = G.enemies.filter(e => e.alive && !e.held && e.type !== 'scientist');
    if (!taught.has('sight') && foes.some(e => e.mode === 'suspicious' && near(e, 25))) { if (try1('sight')) return; }
    if (h.clawsOut && G.finMeter >= 1 && foes.some(e => near(e, 3))) { if (try1('finisher')) return; }
    for (const e of foes) {
      if (e.mode === 'alert' && e.state === 'windup' && near(e, 3.6) && e.move && !e.move.kick) {
        if (!taught.has('block')) { if (try1('block')) return; }
        else if (e.t < 0.2 && try1('parry')) return;
      }
      if (e.mode !== 'alert' && near(e, 2.2) && h.grounded) {
        const f = { x: Math.sin(e.yaw), z: Math.cos(e.yaw) }, dx = h.pos.x - e.pos.x, dz = h.pos.z - e.pos.z;
        if ((f.x * dx + f.z * dz) < 0 && try1('takedown')) return;
      }
    }
    if (h.climbing && h.wall?.box) {
      const b = h.wall.box, w = Math.min(b.max.x - b.min.x, b.max.z - b.min.z), hag = h.heightAboveGround?.() ?? 0;
      if (b.flags?.tree && try1('leap')) return;
      if (w < 3.2 && !b.flags?.tree && hag > 1.5 && try1('corner')) return;
      if (hag > 5 && taught.has('climb') && try1('slide')) return;
    }
    if (!h.grounded && !h.climbing && !h.ladder) {
      const hag = h.heightAboveGround?.() ?? 0;
      if (hag > 4 && h.vel.y < 0 && h.clawsOut && taught.has('climb') && try1('slam')) return;
    }
  };
  G.markTaught = id => { taught.add(id); write(taught); };
  G.taughtHas = id => taught.has(id);
  // claw in: the hero reaches a wall in the air (hero.js exposes reachWall)
  G.teachClimbCheck = () => { const h = G.hero; if (!cur && !taught.has('climb') && !h.grounded && !h.climbing && h.clawsOut !== undefined) { try { if (h.reachWall?.()) G.teach('climb'); } catch (_) {} } };
}
