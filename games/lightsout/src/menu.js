/* =====================================================================
   menu.js — the front of the house, and the board
   =====================================================================
   Liam: *"add in home screens and leader boards to them all"*.

   Drawn on the same overlay canvas as the HUD, in the same 320x240 units
   the HUD is laid out in, so it scales with everything else and there is
   no second coordinate system to keep straight.

   WHAT GOES ON THE BOARD IS THE ESCAPE, NOT THE ATTEMPT. You are ranked
   on SECONDS SPENT IN THE DARK on a successful run - not on total time,
   because standing still with the torch on is safe and a leaderboard
   that rewarded it would be a leaderboard for patience. The dark is the
   thing you are actually buying switches with.

   The board is local: ten rows in localStorage on this machine. There is
   no server behind this game and pretending otherwise would be a lie
   told in a scoreboard.
   ===================================================================== */
const KEY = 'lightsout.board';
const NAME = 'lightsout.name';

export function rows() {
  try {
    const r = JSON.parse(localStorage.getItem(KEY) || '[]');
    return Array.isArray(r) ? r.slice(0, 10) : [];
  } catch (e) { return []; }
}
function write(r) { try { localStorage.setItem(KEY, JSON.stringify(r.slice(0, 10))); } catch (e) {} }
export function playerName() { try { return (localStorage.getItem(NAME) || 'YOU').toUpperCase(); } catch (e) { return 'YOU'; } }
export function setName(n) { try { localStorage.setItem(NAME, (n || 'YOU').slice(0, 3).toUpperCase()); } catch (e) {} }

export function qualifies(dark) {
  const r = rows();
  return r.length < 10 || dark < r[r.length - 1].dark;
}
export function submit(dark, lit, name) {
  const r = rows();
  r.push({ dark: +dark.toFixed(1), lit, name: (name || 'YOU').slice(0, 3).toUpperCase(), when: Date.now() });
  r.sort((a, b) => a.dark - b.dark);
  write(r);
  return r.findIndex((x) => x.when && x.dark === +dark.toFixed(1)) + 1;
}

/**
 * Draw the home screen.
 *
 * Returns the button box so the caller can hit-test a click against it -
 * this module deliberately owns no input; the game already has a pointer
 * lock and a key handler and two of those would fight.
 */
export function drawHome(g, W, H, best) {
  g.fillStyle = 'rgba(3,4,6,0.93)';
  g.fillRect(0, 0, W, H);

  g.fillStyle = '#c9c2ae';
  g.font = 'bold 22px monospace';
  g.fillText('LIGHTS OUT', 18, 40);
  g.font = '8px monospace';
  g.fillStyle = '#8a8272';
  g.fillText('there are six switches in this house', 18, 56);
  /* KEEP THE TEXT OUT OF THE BOARD. The panel starts at x=176, so a
     line that runs past about 160 is a line printed on top of the
     leaderboard - which is what the first version did. */
  g.fillText('the torch is a leash: with it', 18, 70);
  g.fillText('on you cannot take a step, and', 18, 80);
  g.fillText('whatever the beam is on stops', 18, 90);
  g.fillText('dead where it stands. With it', 18, 100);
  g.fillText('off you can run - and so can', 18, 110);
  g.fillText('everything else in the house.', 18, 120);

  /* the button */
  const b = { x: 18, y: 134, w: 120, h: 26 };
  g.fillStyle = '#ffe9a8';
  g.fillRect(b.x, b.y, b.w, b.h);
  g.fillStyle = '#0b0c10';
  g.font = 'bold 11px monospace';
  g.fillText('GO IN', b.x + 12, b.y + 17);

  g.fillStyle = '#6a6252';
  g.font = '8px monospace';
  g.fillText('click to start · mouse turns', 18, 178);
  g.fillText('F torch · E switch · Q blanket', 18, 188);
  g.fillText('W A S D run (torch off) · R restart', 18, 198);

  /* the board */
  const bx = 176;
  g.fillStyle = 'rgba(255,255,255,0.04)';
  g.fillRect(bx, 24, 128, 190);
  g.fillStyle = '#8a8272';
  g.font = '8px monospace';
  g.fillText('FASTEST ESCAPES', bx + 8, 38);
  g.fillText('SECONDS IN THE DARK', bx + 8, 48);
  const list = rows();
  for (let i = 0; i < 10; i++) {
    const r = list[i];
    const y = 64 + i * 14;
    g.fillStyle = '#4a463c';
    g.fillText(String(i + 1).padStart(2, ' '), bx + 8, y);
    if (!r) { g.fillStyle = '#2e2b25'; g.fillText('—', bx + 30, y); continue; }
    g.fillStyle = '#c9c2ae';
    g.fillText(r.name, bx + 30, y);
    g.fillStyle = '#ffe9a8';
    g.fillText(r.dark.toFixed(1) + 's', bx + 96, y);
  }
  if (best !== undefined && best !== null) {
    g.fillStyle = '#8a8272';
    g.fillText('last escape  ' + best.toFixed(1) + 's in the dark', 18, 214);
  }
  return b;
}

/** the three-initials prompt, after a run that earned a place */
export function drawEntry(g, W, H, dark, typed) {
  g.fillStyle = 'rgba(3,4,6,0.94)';
  g.fillRect(0, 0, W, H);
  g.fillStyle = '#ffe9a8';
  g.font = 'bold 14px monospace';
  g.fillText('YOU GOT OUT', 18, 44);
  g.font = '10px monospace';
  g.fillStyle = '#c9c2ae';
  g.fillText(dark.toFixed(1) + ' seconds spent in the dark', 18, 62);
  g.fillStyle = '#8a8272';
  g.font = '8px monospace';
  g.fillText('that is a top ten run - type three letters, then ENTER', 18, 78);

  for (let i = 0; i < 3; i++) {
    const x = 18 + i * 32;
    g.fillStyle = 'rgba(255,255,255,0.06)';
    g.fillRect(x, 90, 26, 30);
    g.strokeStyle = i === typed.length ? '#ffe9a8' : 'rgba(255,255,255,0.2)';
    g.lineWidth = 1;
    g.strokeRect(x + 0.5, 90.5, 25, 29);
    g.fillStyle = '#ffe9a8';
    g.font = 'bold 18px monospace';
    if (typed[i]) g.fillText(typed[i], x + 6, 112);
  }
}
