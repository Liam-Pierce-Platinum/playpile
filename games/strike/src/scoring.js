// 10-frame bowling scoring. Pure module.
// rolls: array of pins knocked per ball, in order.

export function frameStarts(rolls) {
  const starts = []; let i = 0;
  for (let f = 0; f < 10 && i < rolls.length; f++) {
    starts.push(i);
    if (f < 9) i += rolls[i] === 10 ? 1 : 2;
  }
  return starts;
}

// state of the game after these rolls
export function gameState(rolls) {
  const st = frameStarts(rolls);
  const frames = [];
  let cum = 0, open = true;
  for (let f = 0; f < 10; f++) {
    const s = st[f];
    const fr = { rolls: [], marks: [], score: null };
    if (s !== undefined) {
      const end = f < 9 ? Math.min(s + (rolls[s] === 10 ? 1 : 2), rolls.length) : rolls.length;
      fr.rolls = rolls.slice(s, Math.min(end, s + 3));
      fr.marks = marks(fr.rolls, f === 9);
      // frame score
      let val = null;
      if (f < 9) {
        if (rolls[s] === 10) { if (rolls.length > s + 2) val = 10 + rolls[s + 1] + rolls[s + 2]; }
        else if (rolls.length > s + 1) {
          if (rolls[s] + rolls[s + 1] === 10) { if (rolls.length > s + 2) val = 10 + rolls[s + 2]; }
          else val = rolls[s] + rolls[s + 1];
        }
      } else if (tenthDone(fr.rolls)) val = fr.rolls.reduce((a, b) => a + b, 0);
      if (val !== null && open) { cum += val; fr.score = cum; } else open = false;
    }
    frames.push(fr);
  }
  // where are we now
  let frame = st.length - 1, ball = 0;
  if (frame < 0) frame = 0;
  else {
    const fr = frames[frame];
    const complete = frame < 9 ? (fr.rolls[0] === 10 || fr.rolls.length === 2) : tenthDone(fr.rolls);
    if (complete) { frame++; ball = 0; } else ball = fr.rolls.length;
  }
  const over = frame >= 10;
  // does the next ball get a full fresh rack?
  let fresh = ball === 0;
  if (!over && frame === 9 && ball > 0) {
    const r = frames[9].rolls;
    if (ball === 1) fresh = r[0] === 10;
    else fresh = (r[0] === 10 && r[1] === 10) || (r[0] !== 10 && r[0] + r[1] === 10);
  }
  const total = frames.reduce((m, f) => (f.score !== null ? f.score : m), 0);
  return { frames, frame: Math.min(frame, 9), ball, over, fresh, total, maxPossible: maxPossible(rolls) };
}

function tenthDone(r) { return r.length === 3 || (r.length === 2 && r[0] + r[1] < 10); }

export function marks(r, tenth) {
  const m = [];
  if (!tenth) {
    if (r[0] === 10) return ['', 'X'];
    if (r.length > 0) m.push(r[0] ? String(r[0]) : '-');
    if (r.length > 1) m.push(r[0] + r[1] === 10 ? '/' : r[1] ? String(r[1]) : '-');
    return m;
  }
  for (let i = 0; i < r.length; i++) {
    const v = r[i];
    // is this ball the second of a pair on the same rack?
    let second = false;
    if (i === 1) second = r[0] !== 10;
    if (i === 2) second = r[0] === 10 ? r[1] !== 10 : false;
    if (second && r[i - 1] + v === 10) m.push('/');
    else m.push(v === 10 ? 'X' : v ? String(v) : '-');
  }
  return m;
}

// best total still reachable (for the "perfect game still on" pop and tests)
export function maxPossible(rolls) {
  const r = rolls.slice();
  for (let k = 0; k < 25; k++) {
    const s = gameStateLite(r);
    if (s.over) break;
    r.push(s.standing);
  }
  return scoreOnly(r);
}
function gameStateLite(rolls) {
  const st = frameStarts(rolls);
  let frame = st.length - 1, ball = 0;
  if (frame < 0) return { over: false, standing: 10 };
  const s = st[frame], fr = frame < 9 ? rolls.slice(s, s + (rolls[s] === 10 ? 1 : 2)) : rolls.slice(s, s + 3);
  const complete = frame < 9 ? (fr[0] === 10 || fr.length === 2) : tenthDone(fr);
  if (complete) { if (frame + 1 >= 10) return { over: true }; return { over: false, standing: 10 }; }
  ball = fr.length;
  if (frame < 9) return { over: false, standing: 10 - fr[0] };
  if (ball === 1) return { over: false, standing: fr[0] === 10 ? 10 : 10 - fr[0] };
  const fresh = (fr[0] === 10 && fr[1] === 10) || (fr[0] !== 10 && fr[0] + fr[1] === 10);
  return { over: false, standing: fresh ? 10 : 10 - fr[1] };
}
function scoreOnly(rolls) {
  const st = frameStarts(rolls); let t = 0;
  for (let f = 0; f < st.length; f++) {
    const s = st[f];
    if (f === 9) { t += rolls.slice(s, s + 3).reduce((a, b) => a + b, 0); break; }
    if (rolls[s] === 10) t += 10 + (rolls[s + 1] || 0) + (rolls[s + 2] || 0);
    else if (rolls[s] + (rolls[s + 1] || 0) === 10) t += 10 + (rolls[s + 2] || 0);
    else t += rolls[s] + (rolls[s + 1] || 0);
  }
  return t;
}
